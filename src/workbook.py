"""Read XLSX leads and surgically patch status cells, preserving other ZIP parts."""
import hashlib
import json
import os
import posixpath
import re
import shutil
import sys
import tempfile
import zipfile
from xml.etree import ElementTree as ET
from xml.sax.saxutils import escape

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"


def read(path, mapping=None, review=False):
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
            aliases = {"company": "carrier legal name", "company name": "carrier legal name", "legal name": "carrier legal name", "email address": "email", "contact": "owner / principal", "contact name": "owner / principal", "name": "owner / principal"}
            for alias, canonical in aliases.items():
                if canonical not in fields and alias in fields:
                    fields[canonical] = fields[alias]
            overrides = (mapping or {}).get(sheet.attrib["name"], {})
            for field, col in overrides.items():
                if not isinstance(col, str) or not re.fullmatch(r"[A-Z]{1,3}", col):
                    raise ValueError("Column mappings must use Excel column letters")
                fields[field.lower()] = col
            email_col = fields.get("email")
            status_col = fields.get("status")
            meta = {"name": sheet.attrib["name"], "part": part,
                    "hidden": sheet.attrib.get("state", "visible") != "visible",
                    "emailColumn": email_col, "statusColumn": status_col, "headers": headers, "rows": 0}
            if review:
                meta["review"] = {"emailColumns": {}, "samples": []}
                used_columns = set(headers)
            sheets.append(meta)
            if not email_col and not review:
                continue
            for row in rows[1:]:
                values = cells(row)
                if review:
                    used_columns.update(values)
                    for col, text in values.items():
                        if re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", text):
                            counts = meta["review"]["emailColumns"]
                            counts[col] = counts.get(col, 0) + 1
                    samples = meta["review"]["samples"]
                    if sum(s["kind"] == "sample" for s in samples) < 3:
                        samples.append({"row": int(row.attrib["r"]), "kind": "sample", "issue": "",
                                        "cells": {k: v[:200] for k, v in list(values.items())[:80]}})
                if not email_col:
                    continue
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
                if review:
                    samples = meta["review"]["samples"]
                    if layout_issue and sum(s["kind"] == "flagged" for s in samples) < 3:
                        samples.append({"row": number, "kind": "flagged",
                                        "issue": layout_issue,
                                        "cells": {k: v[:200] for k, v in list(values.items())[:80]}})
                meta["rows"] += 1
            if review:
                def col_number(col):
                    n = 0
                    for char in col:
                        n = n * 26 + ord(char) - 64
                    return n
                next_number = max((col_number(c) for c in used_columns), default=0) + 1
                next_column = ""
                if next_number <= 16384:
                    while next_number:
                        next_number, mod = divmod(next_number - 1, 26)
                        next_column = chr(65 + mod) + next_column
                meta["review"]["unusedStatusColumn"] = next_column or None
        return {"sheets": sheets, "leads": leads}


def review_import(path, mapping=None, strict_status=False):
    """Read-only review. Never patches a workbook or changes sending eligibility."""
    if mapping is not None:
        if not isinstance(mapping, dict):
            raise ValueError("Mapping must be a JSON object keyed by worksheet name")
        for name, fields in mapping.items():
            if not isinstance(name, str) or not isinstance(fields, dict):
                raise ValueError("Each worksheet mapping must be a JSON object")
            for field, col in fields.items():
                if not isinstance(field, str) or not isinstance(col, str) or not re.fullmatch(r"[A-Z]{1,3}", col):
                    raise ValueError("Column mappings must use Excel column letters")
    parsed = read(path, mapping, review=True)
    if strict_status:
        for sheet in parsed["sheets"]:
            status_col = sheet.get("statusColumn")
            if not status_col:
                continue
            label = sheet["headers"].get(status_col, "").strip().lower()
            if not re.fullmatch(r"(?:(?:outreach|email|proposal|contact)[ _-]+)?status", label):
                raise ValueError("Status mapping must use a labelled outreach Status column. Add a new Status header in an unused column instead.")
            if status_col == sheet.get("emailColumn") or any(key.lower() != "status" and col == status_col for key, col in (mapping or {}).get(sheet["name"], {}).items()):
                raise ValueError("Status column cannot also map another field")
    names = {s["name"] for s in parsed["sheets"]}
    if set(mapping or {}) - names:
        raise ValueError("Mapping refers to an unknown worksheet")
    summary = {"rows": len(parsed["leads"]), "flaggedRows": 0,
               "missingStatusSheets": 0, "invalidEmailRows": 0,
               "duplicateEmailRows": 0, "sheets": len(parsed["sheets"])}
    seen = set()
    for sheet in parsed["sheets"]:
        leads = [l for l in parsed["leads"] if l["sheet"] == sheet["name"]]
        sheet["flaggedRows"] = sum(bool(l["layoutIssue"]) for l in leads)
        sheet["invalidEmailRows"] = sum(not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", l["email"]) for l in leads)
        sheet["missingStatus"] = not bool(sheet["statusColumn"])
        summary["flaggedRows"] += sheet["flaggedRows"]
        summary["invalidEmailRows"] += sheet["invalidEmailRows"]
        summary["missingStatusSheets"] += sheet["missingStatus"]
        for lead in leads:
            email = lead["email"]
            if re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
                if email in seen:
                    summary["duplicateEmailRows"] += 1
                seen.add(email)
    return {"summary": summary, "sheets": parsed["sheets"], "mapping": mapping or {},
            "readOnly": True, "basis": "Parsed workbook rows, not verified prospects or sending eligibility. Email counts use syntax only; issue categories can overlap."}


def add_status_columns(path, additions):
    """Add only a header in a completely unused column of an experiment copy."""
    if not isinstance(additions, dict):
        raise ValueError("Status additions must be keyed by worksheet name")
    info = review_import(path)
    sheets = {s["name"]: s for s in info["sheets"]}
    changes = {}
    with zipfile.ZipFile(path) as source:
        for name, col in additions.items():
            if name not in sheets or not isinstance(col, str) or not re.fullmatch(r"[A-Z]{1,3}", col):
                raise ValueError("Choose a known sheet and valid unused Status column")
            number = 0
            for char in col:
                number = number * 26 + ord(char) - 64
            if number > 16384:
                raise ValueError("Status column is outside Excel's column range")
            sheet = sheets[name]
            if sheet["statusColumn"]:
                raise ValueError("This sheet already has a Status header; map it explicitly instead")
            xml = source.read(sheet["part"]).decode("utf-8")
            if re.search(rf'<(?:\w+:)?c\b[^>]*\br="{col}\d+"', xml):
                raise ValueError("Status must use a completely unused column; existing cells cannot be overwritten")
            document = ET.fromstring(xml)
            # Avoid altering merged headers or inserting into a merged range.
            if document.find("m:mergeCells", NS) is not None:
                raise ValueError("Merged worksheet headers need manual source review")
            row = re.search(r'(<row\b[^>]*\br="(\d+)"[^>]*>)(.*?)(</row>)', xml, re.S)
            if not row:
                raise ValueError("Cannot safely locate the worksheet header row")
            header = f'<c r="{col}{row.group(2)}" t="inlineStr"><is><t>Status</t></is></c>'
            body = row.group(3)
            def col_number(value):
                n = 0
                for char in value:
                    n = n * 26 + ord(char) - 64
                return n
            later = next((m for m in re.finditer(r'<c\b[^>]*\br="([A-Z]+)\d+"', body) if col_number(m.group(1)) > number), None)
            at = later.start() if later else len(body)
            xml = xml[:row.start(3)] + body[:at] + header + body[at:] + xml[row.end(3):]
            dimension = re.search(r'<dimension\b[^>]*ref="([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?"[^>]*/>', xml)
            if dimension:
                start_col = dimension.group(1)
                end_col = dimension.group(3) or dimension.group(1)
                start_col = col if number < col_number(start_col) else start_col
                end_col = col if number > col_number(end_col) else end_col
                value = f'{start_col}{dimension.group(2)}:{end_col}{dimension.group(4) or dimension.group(2)}'
                updated = re.sub(r'\bref="[^"]*"', f'ref="{value}"', dimension.group(0), count=1)
                xml = xml[:dimension.start()] + updated + xml[dimension.end():]
            ET.fromstring(xml)
            changes[sheet["part"]] = xml.encode("utf-8")
        parts = [(item, changes.get(item.filename, source.read(item.filename))) for item in source.infolist()]
    if changes:
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(path)), suffix=".xlsx")
        try:
            with os.fdopen(fd, "wb") as out, zipfile.ZipFile(out, "w") as dest:
                for item, content in parts:
                    dest.writestr(item, content)
            os.replace(tmp, path)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)


def experiment_import(path, payload):
    mapping = payload.get("mapping", {})
    # Validate before modifying even a temporary copy.
    review_import(path, mapping)
    baseline = read(path, payload.get("sourceMapping", {}))["leads"]
    additions = payload.get("addStatusColumns", {})
    with tempfile.TemporaryDirectory() as directory:
        target = payload.get("output") or os.path.join(directory, "working.xlsx")
        shutil.copyfile(path, target)
        if additions:
            add_status_columns(target, additions)
        effective = json.loads(json.dumps(mapping))
        for name, col in additions.items():
            fields = effective.setdefault(name, {})
            mapped_status = next((value for key, value in fields.items() if key.lower() == "status"), col)
            if mapped_status != col:
                raise ValueError("Proposed Status mapping conflicts with the new Status column")
            fields["status"] = col
        report = review_import(target, effective, strict_status=payload.get("strictStatus", False))
        return {"report": report, "leads": read(target, effective)["leads"], "baselineLeads": baseline}


def patch(path, changes, mapping=None):
    # Reject mismatched rows before modifying anything.
    current = {x["id"]: x for x in read(path, mapping)["leads"]}
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


def delete_leads(path, ids, mapping=None):
    current = {x["id"]: x for x in read(path, mapping)["leads"]}
    target_ids = set(ids)
    by_part = {}
    for tid in target_ids:
        lead = current.get(tid)
        if lead:
            by_part.setdefault(lead["part"], set()).add(str(lead["row"]))
    if not by_part:
        return {"ok": True, "deleted": 0}
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(path)), suffix=".xlsx")
    try:
        with os.fdopen(fd, "wb") as out, zipfile.ZipFile(path) as source, zipfile.ZipFile(out, "w") as dest:
            for info in source.infolist():
                content = source.read(info.filename)
                if info.filename in by_part:
                    xml = content.decode("utf-8")
                    for row_number in by_part[info.filename]:
                        pattern = rf'<row\b[^>]*\br="{row_number}"[^>]*/>|<row\b[^>]*\br="{row_number}"[^>]*>.*?</row>'
                        xml = re.sub(pattern, "", xml, flags=re.S)
                    content = xml.encode("utf-8")
                    ET.fromstring(content)
                dest.writestr(info, content)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    return {"ok": True, "deleted": sum(len(rows) for rows in by_part.values())}


if __name__ == "__main__":
    try:
        command, path = sys.argv[1:3]
        if command == "experiment":
            print(json.dumps(experiment_import(path, json.load(sys.stdin))))
        elif command == "review":
            raw = sys.stdin.read()
            print(json.dumps(review_import(path, json.loads(raw) if raw else None)))
        elif command == "read":
            raw = sys.stdin.read()
            print(json.dumps(read(path, json.loads(raw) if raw else None)))
        elif command == "patch":
            payload = json.load(sys.stdin)
            patch(path, payload if isinstance(payload, list) else payload["changes"], None if isinstance(payload, list) else payload.get("mapping"))
            print(json.dumps({"ok": True}))
        elif command == "delete":
            payload = json.load(sys.stdin)
            ids = payload if isinstance(payload, list) else payload.get("ids", [])
            mapping = None if isinstance(payload, list) else payload.get("mapping")
            res = delete_leads(path, ids, mapping)
            print(json.dumps(res))
        else:
            raise ValueError("Unknown command")
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
