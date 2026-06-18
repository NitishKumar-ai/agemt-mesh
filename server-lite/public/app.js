const eventLog = document.getElementById('event-log');
const ksStatus = document.getElementById('killswitch-status');

function addEvent(event) {
  const card = document.createElement('div');
  card.className = 'event-card';

  const time = new Date(event.timestamp).toLocaleTimeString();
  const typeClass =
    event.eventType.includes('fail') || event.eventType.includes('timeout')
      ? 'status-failed'
      : event.eventType.includes('system') || event.eventType.includes('killswitch')
        ? 'status-system'
        : 'status-running';

  card.innerHTML = `[${time}] <span class="${typeClass}">${event.agentId}/${event.eventType}</span>\n${JSON.stringify(event.payload, null, 2)}`;

  eventLog.prepend(card);
}

// Subscribe to SSE
const evtSource = new EventSource('/api/agents/events');

evtSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  addEvent(data);

  if (data.eventType === 'killswitch_engaged') {
    updateKillswitchUI(true);
  } else if (data.eventType === 'killswitch_released') {
    updateKillswitchUI(false);
  }
};

evtSource.onerror = (err) => {
  console.error('SSE Error:', err);
};

function updateKillswitchUI(engaged) {
  if (engaged) {
    ksStatus.innerText = 'SYSTEM HALTED (KILLSWITCH ENGAGED)';
    ksStatus.className = 'ks-engaged';
  } else {
    ksStatus.innerText = 'SYSTEM OPERATIONAL';
    ksStatus.className = 'ks-released';
  }
}

// Control buttons
document.getElementById('btn-run-agent').onclick = async () => {
  const res = await fetch('/api/agents/commit_guard/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      goal: 'Clone https://github.com/expressjs/express, scan for vulnerabilities, and file issues for any findings.',
    }),
  });
  const data = await res.json();
  console.log('Run agent result:', data);
};

document.getElementById('btn-engage-ks').onclick = async () => {
  await fetch('/api/agents/killswitch/engage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: 'Manual halt via dashboard' }),
  });
};

document.getElementById('btn-release-ks').onclick = async () => {
  await fetch('/api/agents/killswitch/release', {
    method: 'POST',
  });
};

// Initial status check
fetch('/api/agents/killswitch')
  .then((res) => res.json())
  .then((data) => {
    updateKillswitchUI(data.engaged);
  });
