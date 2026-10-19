import { resolveTxt } from "node:dns/promises";
export async function domainHealth(domain, selectors = [], lookup = resolveTxt) {
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain || ""))
    throw new Error("Enter a valid email domain.");
  if (!Array.isArray(selectors) || selectors.length > 10 || selectors.some((s) => !/^[a-z0-9_-]{1,63}$/i.test(s)))
    throw new Error("Use up to ten DKIM selector names.");
  const read = async (name) => {
    let timer;
    try {
      const records = await Promise.race([lookup(name), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("DNS timeout")), 5000);
      })]);
      return { records: records.map((chunks) => chunks.join("")), state: "found" };
    } catch (e) { return { records: [], state: ["ENODATA", "ENOTFOUND"].includes(e.code) ? "missing" : "unknown" }; }
    finally { clearTimeout(timer); }
  };
  const [spf, dmarc, ...dkim] = await Promise.all([read(domain), read(`_dmarc.${domain}`),
    ...selectors.map((s) => read(`${s}._domainkey.${domain}`))]);
  const warnings = [];
  const spfRecords = spf.records.filter((r) => /^v=spf1(?:\s|$)/i.test(r));
  const dmarcRecords = dmarc.records.filter((r) => /^v=DMARC1(?:;|$)/i.test(r));
  if (spf.state === "unknown") warnings.push("SPF lookup failed; retry DNS checks.");
  else if (spfRecords.length !== 1) warnings.push("Publish exactly one SPF record authorizing the actual sending service.");
  else if (/(?:^|\s)\+all(?:\s|$)/i.test(spfRecords[0])) warnings.push("SPF +all authorizes every sender; review this policy.");
  if (dmarc.state === "unknown") warnings.push("DMARC lookup failed; retry DNS checks.");
  else if (dmarcRecords.length !== 1 || !/(?:^|;)\s*p=(none|quarantine|reject)\s*(?:;|$)/i.test(dmarcRecords[0]))
    warnings.push("Publish one valid DMARC policy after checking SPF/DKIM alignment.");
  if (!selectors.length) warnings.push("Specify the DKIM selector from your provider; selector names cannot be discovered reliably.");
  const dkimResults = dkim.map((result, i) => {
    if (result.state === "unknown") warnings.push(`DKIM lookup for ${selectors[i]} failed; retry.`);
    else if (!result.records.some((r) => /(?:^|;)\s*p=([^;\s]+)/.test(r)))
      warnings.push(`DKIM key missing or revoked for selector ${selectors[i]}; check the provider configuration.`);
    return { selector: selectors[i], ...result };
  });
  return { domain, checkedAt: new Date().toISOString(), spf: { ...spf, records: spfRecords },
    dmarc: { ...dmarc, records: dmarcRecords }, dkim: dkimResults, warnings,
    limitation: "Read-only record checks; not a complete SPF lookup-limit, DKIM signature, or DMARC alignment validation. No DNS changes made." };
}
