import sys, zipfile
from xml.sax.saxutils import escape
ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
def cell(ref,text): return f'<c r="{ref}" t="inlineStr"><is><t>{escape(text)}</t></is></c>'
rows='<row r="1">'+cell('A1','Company')+cell('B1','Email address')+cell('C1','Status')+'</row>'
for r in range(2,5): rows+=f'<row r="{r}">'+cell(f'A{r}',f'Example {r}')+cell(f'B{r}',f'owner{r}@example.com')+cell(f'C{r}','')+'</row>'
with zipfile.ZipFile(sys.argv[1],'w') as z:
 z.writestr('xl/workbook.xml',f'<workbook xmlns="{ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Leads" sheetId="1" r:id="rId1"/></sheets></workbook>')
 z.writestr('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
 z.writestr('xl/worksheets/sheet1.xml',f'<worksheet xmlns="{ns}"><sheetData>{rows}</sheetData></worksheet>')
