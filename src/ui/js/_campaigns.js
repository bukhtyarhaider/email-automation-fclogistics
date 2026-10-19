if ($("upload"))
  $("upload").onchange = () =>
    action($("reload"), async () => {
      const file = $("upload").files[0];
      if (!file) return;
      const r = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "X-FC-Request": "1",
          "X-Filename": encodeURIComponent(file.name),
        },
        body: file,
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      selected.clear();
      offset = 0;
      previewId = null;
      await refresh();
      fillCampaign();
      $("upload").value = "";
      notice("Campaign imported successfully.");
    });


async function deleteActiveCampaign(btn) {
  if (!state.activeCampaign) return;
  const c = state.campaigns.find((c) => c.id === state.activeCampaign);
  if (
    !confirm(
      `Are you sure you want to delete workspace "${c?.name || "Current"}" and all its leads?`,
    )
  )
    return;
  action(btn, async () => {
    await api("/api/delete-campaign", { id: state.activeCampaign });
    selected.clear();
    previewId = null;
    offset = 0;
    await refresh();
    fillCampaign();
    await loadLeads();
    notice("Workspace deleted.");
  });
}

if ($("deleteWorkspace"))
  $("deleteWorkspace").onclick = () =>
    deleteActiveCampaign($("deleteWorkspace"));

if ($("deleteCampaignBtn"))
  $("deleteCampaignBtn").onclick = () =>
    deleteActiveCampaign($("deleteCampaignBtn"));


function fillCampaign() {
  const c = state.campaigns.find((c) => c.id === state.activeCampaign);
  if ($("campaignName")) $("campaignName").value = c?.name || "";
  if ($("campaignEnabled")) $("campaignEnabled").checked = c?.enabled !== false;
  if ($("campaignSheets")) $("campaignSheets").value = (c?.sheets || []).join("\n");
  if ($("mapping")) $("mapping").value = JSON.stringify(c?.mapping || {}, null, 2);
  if ($("headers")) {
    $("headers").textContent = state.sheets
      .map(
        (s) =>
          `${s.name}: ${Object.entries(s.headers || {})
            .map(([k, v]) => `${k}=${v}`)
            .join(", ")}`,
      )
      .join("\n");
  }
}


if ($("campaignSelect"))
  $("campaignSelect").onchange = () =>
    action($("reload"), async () => {
      await api("/api/select-campaign", { id: $("campaignSelect").value });
      selected.clear();
      previewId = null;
      offset = 0;
      await refresh();
      fillCampaign();
    });


if ($("saveCampaign"))
  $("saveCampaign").onclick = () =>
    action($("saveCampaign"), () =>
      api("/api/campaign", {
        id: state.activeCampaign,
        name: $("campaignName").value,
        enabled: $("campaignEnabled").checked,
        sheets: $("campaignSheets").value.split("\n").filter(Boolean),
        mapping: JSON.parse($("mapping").value || "{}"),
      }),
    );
