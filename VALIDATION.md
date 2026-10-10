# Validation — October 10, 2026

- `npm test`: 12 Node tests and 4 Python tests passed.
- Node syntax checks passed for the server, mail adapter and frontend.
- Live Private Email sign-in and compose were exercised in the tool's separate Chrome session.
- One authorized introduction was submitted. Private Email displayed **Message sent**.
- The recipient, subject, inserted body HTML and unchanged signature were verified before sending.
- The workbook working copy now has **Proposal Sent** at `Jess July (20-24)!G141`.
- Comparing every XLSX ZIP part and worksheet cell with the original backup found exactly one changed cell. Other ZIP parts, formulas and style identifiers were preserved. The source workbook in Downloads remains byte-identical to the backup.
- The download button produced an XLSX identical to the working copy.
- The app's send confirmation and signature preview were visually inspected. A full workbook render through the bundled spreadsheet renderer did not finish; workbook preservation was checked directly at the ZIP/XML level instead.
- Automatic sending to a full batch was not exercised against live recipients. Tests cover the durable send reservation, uncertainty, failed status writes and repeat prevention; batch pacing and stop behavior are implemented in the server.
- The imported workbook has 9,208 lead rows across six sheets. Layout/status deficiencies exclude some records. The tool also excludes prior contacts, duplicates and suppressions.
- Submission confirmation does not establish final inbox delivery. Domain authentication and inbox placement have not been verified.

The snapshot workbook under `outputs/` reflects the first confirmed introduction. Further sends update the working copy; use **Download status workbook** for the latest export.
