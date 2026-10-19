function renderSuppressionList() {
  const supList = $("suppressionList");
  if (!supList || !state?.suppression) return;
  const q = ($("suppressionSearch")?.value || "").toLowerCase().trim();
  const countBadge = $("suppressionCountBadge");
  const entries = Object.entries(state.suppression);
  if (countBadge) {
    countBadge.textContent = `${entries.length} Suppressed`;
  }
  const filtered = entries.filter(([e, r]) => {
    if (!q) return true;
    return `${e} ${r}`.toLowerCase().includes(q);
  });
  supList.innerHTML = filtered.length
    ? filtered
        .map(
          ([e, r]) =>
            `<li>
              <div>
                <strong>${escape(e)}</strong>
                <div class="hint" style="margin: 2px 0 0 0;">${escape(r)}</div>
              </div>
              <button class="secondary danger-hover" style="font-size: 11px; padding: 4px 10px;" data-unsuppress="${escape(e)}" title="Remove from Do Not Contact list">Remove</button>
            </li>`,
        )
        .join("")
    : '<li style="justify-content: center; color: var(--text-muted); padding: 20px;">No suppressed records matching filter.</li>';
}


if ($("suppress"))
  $("suppress").onclick = () =>
    action($("suppress"), async () => {
      await api("/api/suppress", {
        email: $("suppressEmail").value,
        reason: $("suppressReason").value,
      });
      $("suppressEmail").value = "";
      $("suppressReason").value = "";
      notice("Recipient added to suppression list.");
    });


if ($("suppressionSearch"))
  $("suppressionSearch").oninput = () => {
    renderSuppressionList();
  };

if ($("suppressionList"))
  $("suppressionList").onclick = (e) => {
    const unsuppBtn = e.target.closest("[data-unsuppress]");
    if (unsuppBtn) {
      const email = unsuppBtn.dataset.unsuppress;
      if (!confirm(`Remove ${email} from Do Not Contact list?`)) return;
      action(unsuppBtn, async () => {
        await api("/api/unsuppress", { email });
        notice(`Removed ${email} from suppression list.`);
      });
    }
  };
