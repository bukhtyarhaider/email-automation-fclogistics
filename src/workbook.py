"""Read XLSX leads and surgically patch status cells, preserving other ZIP parts."""
import hashlib
import json
import os
import posixpath
import re
import sys
import tempfile
import zipfile
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def read(path):
    with zipfile.ZipFile(path) as z:
        if sum(i.file_size for i in z.infolist()) > 150_000_000:
            raise ValueError("Workbook exceeds the 150 MB uncompressed limit")
        strings = []
        if "xl/sharedStrings.xml" in z.namelist():
            strings = ["".join(t.text or "" for t in si.iterfind(".//m:t", NS))
                       for si in ET.fromstring(z.read("xl/sharedStrings.xml"))]
        links = {r.attrib["Id"]: posixpath.normpath(posixpath.join("xl", r.attrib["Target"]))
                 if not r.attrib["Target"].startswith("/") else r.attrib["Target"].lstrip("/")
                 for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
        sheets, leads = [], []
        for sheet in ET.fromstring(z.read("xl/workbook.xml")).find("m:sheets", NS):
            part = links[sheet.attrib[REL]]
            rows = ET.fromstring(z.read(part)).findall("m:sheetData/m:row", NS)
            def cells(row):
                result = {}
                for c in row:
                    if not c.tag.endswith("}c"):
                        continue
                    v = c.find("m:v", NS)
                    text = v.text or "" if v is not None else ""
                    if c.attrib.get("t") == "s":
                        text = strings[int(text)]
                    elif c.attrib.get("t") == "inlineStr":
                        text = "".join(t.text or "" for t in c.iterfind(".//m:t", NS))
                    result[re.sub(r"\d", "", c.attrib["r"])] = text.strip()
                return result
            if not rows:
                continue
            headers = cells(rows[0])
            fields = {value.lower(): col for col, value in headers.items() if value}
            email_col = fields.get("email")
            status_col = fields.get("status")
            meta = {"name": sheet.attrib["name"], "part": part,
                    "hidden": sheet.attrib.get("state", "visible") != "visible",
                    "emailColumn": email_col, "statusColumn": status_col, "rows": 0}
            sheets.append(meta)
            if not email_col:
                continue
            for row in rows[1:]:
                values = cells(row)
                company_col = fields.get("carrier legal name") or ("A" if not headers.get("A") else None)
                company = values.get(company_col, "")
                if not company:
                    continue
                number = int(row.attrib["r"])
                data = {name: values.get(col, "") for name, col in fields.items()}
                # Unlabelled historical notes still carry opt-outs and sent flags.
                data["historical notes"] = " | ".join(v for k, v in values.items() if not headers.get(k))
                email = values.get(email_col, "").lower()
                layout_issue = ""
                if email and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
                    alternatives = [(col, text) for col, text in values.items()
                                    if re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", text)]
                    if alternatives:
                        layout_issue = "Row values do not match worksheet headers"
                        email = alternatives[0][1].lower()
                identity = f"{part}:{number}:{email}"
                leads.append({"id": hashlib.sha256(identity.encode()).hexdigest()[:24],
                              "sheet": meta["name"], "part": part, "row": number,
                              "statusCell": f"{status_col}{number}" if status_col else None,
                              "emailCell": f"{email_col}{number}", "email": email,
                              "company": company, "status": values.get(status_col, ""),
                              "layoutIssue": layout_issue, "fields": data})
                meta["rows"] += 1
        return {"sheets": sheets, "leads": leads}


def patch(path, changes):
    # Reject mismatched rows before modifying anything.
    current = {x["id"]: x for x in read(path)["leads"]}
    by_part = {}
    for change in changes:
        lead = current.get(change["id"])
        if not lead or lead["email"] != change["email"] or not lead["statusCell"]:
            raise ValueError("Lead identity changed or this tab has no Status column")
        if not isinstance(change["status"], str) or len(change["status"]) > 200:
            raise ValueError("Invalid status")
        by_part.setdefault(lead["part"], []).append((lead["statusCell"], change["status"]))
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(path)), suffix=".xlsx")
    try:
        with os.fdopen(fd, "wb") as out, zipfile.ZipFile(path) as source, zipfile.ZipFile(out, "w") as dest:
            for info in source.infolist():
                content = source.read(info.filename)
                if info.filename in by_part:
                    xml = content.decode("utf-8")
                    for address, status in by_part[info.filename]:
                        # Match a complete cell, including a self-closing blank.
                        pattern = rf'<c\b(?=[^>]*\br="{address}")([^>]*?)(?:/>|>(.*?)</c>)'
                        match = re.search(pattern, xml, re.S)
                        if match:
                            attrs = re.sub(r'\s+t="[^"]*"', "", match.group(1))
                            replacement = f'<c{attrs} t="inlineStr"><is><t>{escape(status)}</t></is></c>'
                            xml = xml[:match.start()] + replacement + xml[match.end():]
                        else:
                            row_number = re.search(r"\d+", address).group()
                            rp = rf'(<row\b[^>]*\br="{row_number}"[^>]*>)(.*?)(</row>)'
                            row_match = re.search(rp, xml, re.S)
                            if not row_match:
                                raise ValueError("Status row missing")
                            new_cell = f'<c r="{address}" t="inlineStr"><is><t>{escape(status)}</t></is></c>'
                            body = row_match.group(2)
                            def col_index(col):
                                result = 0
                                for char in col:
                                    result = result * 26 + ord(char) - 64
                                return result
                            index = col_index(re.sub(r"\d", "", address))
                            later = next((m for m in re.finditer(r'<c\b[^>]*\br="([A-Z]+)\d+"', body)
                                          if col_index(m.group(1)) > index), None)
                            at = later.start() if later else len(body)
                            body = body[:at] + new_cell + body[at:]
                            xml = xml[:row_match.start()] + row_match.group(1) + body + row_match.group(3) + xml[row_match.end():]
                    content = xml.encode("utf-8")
                    ET.fromstring(content)
                dest.writestr(info, content)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


if __name__ == "__main__":
    try:
        command, path = sys.argv[1:3]
        if command == "read":
            print(json.dumps(read(path)))
        elif command == "patch":
            patch(path, json.load(sys.stdin))
            print(json.dumps({"ok": True}))
        else:
            raise ValueError("Unknown command")
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
