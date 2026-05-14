const form = document.getElementById('providerForm');
const statusEl = document.getElementById('formStatus');
const submitBtn = document.getElementById('submitBtn');

function setStatus(text, className) {
  statusEl.textContent = text;
  statusEl.className = `apply-status ${className || ''}`.trim();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  submitBtn.disabled = true;
  setStatus('Saving your application...');

  const payload = Object.fromEntries(new FormData(form).entries());
  payload.expectedPriceUsd = Number(payload.expectedPriceUsd || 0);
  payload.monthlyVolumeEstimate = Number(payload.monthlyVolumeEstimate || 0);

  try {
    const res = await fetch(form.dataset.submitUrl || '/proxy/applications/provider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || 'Application failed');
    form.reset();
    setStatus(`Application received. Reference: ${data.application.id}`, 'ok');
  } catch (err) {
    setStatus(err.message || 'Something went wrong. Try again or DM @meterflowsol.', 'err');
  } finally {
    submitBtn.disabled = false;
  }
});
