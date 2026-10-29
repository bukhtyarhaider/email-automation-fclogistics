import importlib.util
import os
import tempfile
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("workbook", Path(__file__).parents[1] / "src/workbook.py")
workbook = importlib.util.module_from_spec(spec)
spec.loader.exec_module(workbook)


def cell(address, text):
    return f'<c r="{address}" t="inlineStr"><is><t>{text}</t></is></c>'


class WorkbookTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tmp.name, "leads.xlsx")
        ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
        self.xml = f'<worksheet xmlns="{ns}"><sheetData><row r="1">' + cell("A1", "Carrier Legal Name") + cell("G1", "Status") + cell("H1", "Email") + '</row><row r="2">' + cell("A2", "Example LLC") + '<c r="G2" s="3"/>' + cell("H2", "owner@example.com") + '<c r="I2"><f>1+1</f><v>2</v></c></row></sheetData></worksheet>'
        with zipfile.ZipFile(self.path, "w") as z:
            z.writestr("xl/workbook.xml", f'<workbook xmlns="{ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Leads" sheetId="1" r:id="rId1"/></sheets></workbook>')
            z.writestr("xl/_rels/workbook.xml.rels", '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
            z.writestr("xl/worksheets/sheet1.xml", self.xml)
            z.writestr("xl/styles.xml", '<preserve-me/>')
            z.writestr("customXml/item.xml", b'original metadata')
    def tearDown(self):
        self.tmp.cleanup()
    def test_patch_preserves_every_other_part_and_cell_style(self):
        l = workbook.read(self.path)["leads"][0]
        with zipfile.ZipFile(self.path) as z:
            original = {i: z.read(i) for i in z.namelist()}
        workbook.patch(self.path, [{"id": l["id"], "email": l["email"], "status": "Proposal Sent"}])
        with zipfile.ZipFile(self.path) as z:
            for part, content in original.items():
                if part != "xl/worksheets/sheet1.xml":
                    self.assertEqual(z.read(part), content)
            xml = z.read("xl/worksheets/sheet1.xml").decode()
            self.assertIn('s="3"', xml)
            self.assertIn('<f>1+1</f><v>2</v>', xml)
        self.assertEqual(workbook.read(self.path)["leads"][0]["status"], "Proposal Sent")
    def test_changed_email_rejected_without_modification(self):
        lead = workbook.read(self.path)["leads"][0]
        original = Path(self.path).read_bytes()
        with self.assertRaises(ValueError):
            workbook.patch(self.path, [{"id":lead["id"], "email":"other@example.com", "status":"Sent"}])
        self.assertEqual(Path(self.path).read_bytes(), original)
    def test_missing_status_cell_inserted_in_correct_column_order(self):
        with zipfile.ZipFile(self.path) as z:
            parts = {i:z.read(i) for i in z.namelist()}
        parts["xl/worksheets/sheet1.xml"] = self.xml.replace('<c r="G2" s="3"/>', '').encode()
        with zipfile.ZipFile(self.path, "w") as z:
            for part, content in parts.items():
                z.writestr(part, content)
        l = workbook.read(self.path)["leads"][0]
        workbook.patch(self.path, [{"id":l["id"], "email":l["email"], "status":"Send Uncertain"}])
        with zipfile.ZipFile(self.path) as z:
            xml = z.read("xl/worksheets/sheet1.xml").decode()
        self.assertLess(xml.index('r="G2"'), xml.index('r="H2"'))
    def test_supplied_sheet_headers_are_not_assumed_for_shifted_rows(self):
        with zipfile.ZipFile(self.path) as z:
            parts = {i:z.read(i) for i in z.namelist()}
        parts["xl/worksheets/sheet1.xml"] = self.xml.replace(cell("H2", "owner@example.com"), cell("H2", "3 months active") + cell("O2", "owner@example.com")).encode()
        with zipfile.ZipFile(self.path, "w") as z:
            for part, content in parts.items():
                z.writestr(part, content)
        lead = workbook.read(self.path)["leads"][0]
        self.assertEqual(lead["email"], "owner@example.com")
        self.assertTrue(lead["layoutIssue"])

    def test_generic_header_aliases_import_company_and_email(self):
        with zipfile.ZipFile(self.path) as z:
            parts = {i: z.read(i) for i in z.namelist()}
        parts["xl/worksheets/sheet1.xml"] = self.xml.replace("Carrier Legal Name", "Company name").replace(cell("H1", "Email"), cell("H1", "Email address")).encode()
        with zipfile.ZipFile(self.path, "w") as z:
            for part, content in parts.items():
                z.writestr(part, content)
        lead = workbook.read(self.path)["leads"][0]
        self.assertEqual(lead["company"], "Example LLC")
        self.assertEqual(lead["email"], "owner@example.com")

    def test_explicit_column_mapping_is_used_for_read_and_status_patch(self):
        with zipfile.ZipFile(self.path) as z:
            parts = {i: z.read(i) for i in z.namelist()}
        parts["xl/worksheets/sheet1.xml"] = self.xml.replace(cell("H2", "owner@example.com"), cell("H2", "3 months") + cell("O2", "owner@example.com")).replace(cell("G1", "Status"), cell("G1", "Tracking")).encode()
        with zipfile.ZipFile(self.path, "w") as z:
            for part, content in parts.items():
                z.writestr(part, content)
        mapping = {"Leads": {"email": "O", "status": "G"}}
        lead = workbook.read(self.path, mapping)["leads"][0]
        self.assertFalse(lead["layoutIssue"])
        self.assertEqual(lead["statusCell"], "G2")
        workbook.patch(self.path, [{"id":lead["id"], "email":lead["email"], "status":"Sent"}], mapping)
        self.assertEqual(workbook.read(self.path, mapping)["leads"][0]["status"], "Sent")
        with zipfile.ZipFile(self.path) as z:
            self.assertIn(cell("H2", "3 months"), z.read("xl/worksheets/sheet1.xml").decode())

    def test_delete_leads_removes_rows_and_preserves_workbook(self):
        lead = workbook.read(self.path)["leads"][0]
        res = workbook.delete_leads(self.path, [lead["id"]])
        self.assertEqual(res["deleted"], 1)
        leads_after = workbook.read(self.path)["leads"]
        self.assertEqual(len(leads_after), 0)
        with zipfile.ZipFile(self.path) as z:
            xml = z.read("xl/worksheets/sheet1.xml").decode()
            self.assertNotIn('r="2"', xml)
            self.assertIn('r="1"', xml)

    def test_import_review_and_mapping_preview_leave_every_source_byte_unchanged(self):
        with zipfile.ZipFile(self.path) as z:
            parts = {i: z.read(i) for i in z.namelist()}
        parts["xl/worksheets/sheet1.xml"] = self.xml.replace(cell("H2", "owner@example.com"), cell("H2", "3 months") + cell("O2", "owner@example.com")).encode()
        with zipfile.ZipFile(self.path, "w") as z:
            for part, content in parts.items():
                z.writestr(part, content)
        original = Path(self.path).read_bytes()
        saved = workbook.review_import(self.path)
        self.assertEqual(saved["summary"]["flaggedRows"], 1)
        self.assertEqual(saved["sheets"][0]["review"]["emailColumns"], {"O": 1})
        preview = workbook.review_import(self.path, {"Leads": {"email": "O"}})
        self.assertEqual(preview["summary"]["flaggedRows"], 0)
        self.assertTrue(preview["readOnly"])
        self.assertEqual(Path(self.path).read_bytes(), original)
        self.assertNotIn("review", workbook.read(self.path)["sheets"][0])

    def test_import_review_validates_mappings_and_reports_unmapped_sheet_samples(self):
        for mapping in [[], {"Leads": []}, {"Leads": {"email": "../H"}}, {"Missing": {"email": "H"}}]:
            with self.assertRaises(ValueError):
                workbook.review_import(self.path, mapping)
        with zipfile.ZipFile(self.path) as z:
            parts = {i: z.read(i) for i in z.namelist()}
        parts["xl/worksheets/sheet1.xml"] = self.xml.replace(cell("H1", "Email"), cell("H1", "Unknown")).replace(cell("G1", "Status"), cell("G1", "Unknown status")).encode()
        with zipfile.ZipFile(self.path, "w") as z:
            for part, content in parts.items():
                z.writestr(part, content)
        report = workbook.review_import(self.path)
        self.assertEqual(report["summary"]["rows"], 0)
        self.assertEqual(report["summary"]["missingStatusSheets"], 1)
        self.assertEqual(report["sheets"][0]["review"]["emailColumns"], {"H": 1})
        self.assertEqual(report["sheets"][0]["review"]["samples"][0]["row"], 2)

    def test_status_header_added_only_to_experiment_copy_preserves_other_parts_and_cells(self):
        with zipfile.ZipFile(self.path) as z:
            parts = {i: z.read(i) for i in z.namelist()}
        parts["xl/worksheets/sheet1.xml"] = self.xml.replace(cell("G1", "Status"), cell("G1", "Tracking")).encode()
        with zipfile.ZipFile(self.path, "w") as z:
            for part, content in parts.items():
                z.writestr(part, content)
        original = Path(self.path).read_bytes()
        working = os.path.join(self.tmp.name, "experiment.xlsx")
        result = workbook.experiment_import(self.path, {"mapping": {}, "addStatusColumns": {"Leads": "J"}, "output": working})
        self.assertEqual(result["report"]["summary"]["missingStatusSheets"], 0)
        self.assertEqual(result["report"]["mapping"], {"Leads": {"status": "J"}})
        self.assertEqual(workbook.read(working)["leads"][0]["statusCell"], "J2")
        self.assertEqual(Path(self.path).read_bytes(), original)
        with zipfile.ZipFile(working) as z:
            for part, content in parts.items():
                if part != "xl/worksheets/sheet1.xml":
                    self.assertEqual(z.read(part), content)
            xml = z.read("xl/worksheets/sheet1.xml").decode()
            self.assertIn('<f>1+1</f><v>2</v>', xml)
            self.assertIn('<c r="G2" s="3"/>', xml)
            self.assertIn(cell("H2", "owner@example.com"), xml)

    def test_status_header_refuses_existing_cells_invalid_columns_and_conflicting_mapping(self):
        with zipfile.ZipFile(self.path) as z:
            parts = {i: z.read(i) for i in z.namelist()}
        parts["xl/worksheets/sheet1.xml"] = self.xml.replace(cell("G1", "Status"), cell("G1", "Tracking")).encode()
        with zipfile.ZipFile(self.path, "w") as z:
            for part, content in parts.items():
                z.writestr(part, content)
        original = Path(self.path).read_bytes()
        for additions in [{"Leads": "G"}, {"Leads": "H"}, {"Leads": "ZZZ"}, {"Missing": "J"}]:
            with self.assertRaises(ValueError):
                workbook.experiment_import(self.path, {"addStatusColumns": additions})
        with self.assertRaises(ValueError):
            workbook.experiment_import(self.path, {"mapping": {"Leads": {"status": "G"}}, "addStatusColumns": {"Leads": "J"}})
        with self.assertRaises(ValueError):
            workbook.experiment_import(self.path, {"mapping": {"Leads": {"Status": "G"}}, "addStatusColumns": {"Leads": "J"}})
        self.assertEqual(Path(self.path).read_bytes(), original)

    def test_new_status_header_expands_sheet_dimensions_on_either_side(self):
        with zipfile.ZipFile(self.path) as z:
            parts = {i: z.read(i) for i in z.namelist()}
        xml = self.xml.replace(cell("A1", "Carrier Legal Name"), cell("B1", "Carrier Legal Name")).replace(cell("A2", "Example LLC"), cell("B2", "Example LLC")).replace(cell("G1", "Status"), cell("G1", "Tracking")).replace('<sheetData>', '<dimension ref="B1:I2"/><sheetData>')
        for col, dimension in [("A", "A1:I2"), ("J", "B1:J2")]:
            with self.subTest(col=col):
                with zipfile.ZipFile(self.path, "w") as z:
                    for part, content in parts.items():
                        z.writestr(part, xml.encode() if part == "xl/worksheets/sheet1.xml" else content)
                workbook.add_status_columns(self.path, {"Leads": col})
                with zipfile.ZipFile(self.path) as z:
                    self.assertIn(f'ref="{dimension}"', z.read("xl/worksheets/sheet1.xml").decode())


if __name__ == "__main__":
    unittest.main()
