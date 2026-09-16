/* ═══════════════════════════════════════════════════
   工作站同步 · Popup 逻辑
   ═══════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  // DOM 引用
  const $ = id => document.getElementById(id);
  const settingsPanel = $('settingsPanel');
  const statusCard = $('statusCard');
  const statusState = $('statusState');
  const statusDetail = $('statusDetail');
  const syncBtn = $('syncBtn');
  const pushBtn = $('pushBtn');
  const pullBtn = $('pullBtn');
  const syncLog = $('syncLog');

  // ── 初始化 ──

  loadConfig();
  loadStatus();
  loadLogs();

  // ── 事件绑定 ──

  // 设置面板切换
  $('settingsBtn').addEventListener('click', () => {
    settingsPanel.classList.remove('hidden');
  });

  $('backBtn').addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
    loadConfig(); // 刷新状态
  });

  // 自动同步开关
  $('inputAutoSync').addEventListener('change', (e) => {
    $('intervalGroup').style.display = e.target.checked ? 'block' : 'none';
  });

  // 测试连接
  $('testBtn').addEventListener('click', async () => {
    const btn = $('testBtn');
    const result = $('testResult');
    btn.disabled = true;
    btn.textContent = '测试中...';
    result.classList.add('hidden');

    // 先临时保存配置用于测试
    const tempConfig = {
      username: $('inputUsername').value.trim(),
      appPassword: $('inputPassword').value.trim(),
    };

    try {
      const resp = await sendMessage({
        type: 'webdav-test',
        config: tempConfig
      });

      result.classList.remove('hidden', 'success', 'error');
      if (resp.ok) {
        result.classList.add('success');
        result.textContent = resp.exists
          ? `✅ 连接成功！云端已有备份文件`
          : `✅ 连接成功！云端暂无备份，首次同步将创建`;
      } else {
        result.classList.add('error');
        result.textContent = `❌ ${resp.error}`;
      }
    } catch (e) {
      result.classList.remove('hidden', 'success', 'error');
      result.classList.add('error');
      result.textContent = `❌ 测试失败: ${e.message}`;
    }

    btn.disabled = false;
    btn.textContent = '测试连接';
  });

  // 保存设置
  $('saveBtn').addEventListener('click', async () => {
    const config = {
      username: $('inputUsername').value.trim(),
      appPassword: $('inputPassword').value.trim(),
      deviceName: $('inputDevice').value.trim(),
      autoSync: $('inputAutoSync').checked,
      syncInterval: parseInt($('inputInterval').value) || 5,
    };

    if (!config.username || !config.appPassword) {
      alert('请填写坚果云账号和应用密码');
      return;
    }

    await sendMessage({ type: 'save-config', config });
    settingsPanel.classList.add('hidden');
    loadConfig();
    addLog('info', '设置已保存');
  });

  // 同步按钮
  syncBtn.addEventListener('click', () => doSync('bidirectional'));
  pushBtn.addEventListener('click', () => doSync('push'));
  pullBtn.addEventListener('click', () => doSync('pull'));

  // ── 函数 ──

  async function loadConfig() {
    const resp = await sendMessage({ type: 'get-status' });
    const cfg = resp.config || {};

    $('inputUsername').value = cfg.username || '';
    $('inputPassword').value = cfg.appPassword || '';
    $('inputDevice').value = cfg.deviceName || '';
    $('inputAutoSync').checked = !!cfg.autoSync;
    $('intervalGroup').style.display = cfg.autoSync ? 'block' : 'none';
    $('inputInterval').value = cfg.syncInterval || 5;

    const connected = !!(cfg.username && cfg.appPassword);
    syncBtn.disabled = !connected;
    pushBtn.disabled = !connected;
    pullBtn.disabled = !connected;
  }

  async function loadStatus() {
    const resp = await sendMessage({ type: 'get-status' });
    updateStatusUI(resp.status);
  }

  function updateStatusUI(status) {
    statusCard.className = 'status-card ' + (status.state || 'idle');

    const stateLabels = {
      idle: '待同步',
      syncing: '同步中...',
      pulling: '拉取中...',
      pushing: '推送中...',
      error: '同步失败',
    };

    statusState.textContent = stateLabels[status.state] || '未知';
    statusDetail.textContent = status.detail || '';

    if (status.state === 'syncing' || status.state === 'pulling' || status.state === 'pushing') {
      syncBtn.disabled = true;
      syncBtn.classList.add('loading');
    } else {
      syncBtn.classList.remove('loading');
    }
  }

  async function doSync(direction) {
    const typeMap = {
      bidirectional: 'sync-bidirectional',
      push: 'sync-push',
      pull: 'sync-pull',
    };

    syncBtn.disabled = true;
    pushBtn.disabled = true;
    pullBtn.disabled = true;
    updateStatusUI({ state: direction === 'pull' ? 'pulling' : direction === 'push' ? 'pushing' : 'syncing' });

    try {
      const resp = await sendMessage({ type: typeMap[direction] });
      if (resp.ok) {
        updateStatusUI({ state: 'idle', synced: true, detail: getActionLabel(resp.action) });
        addLog(direction === 'pull' ? 'pull' : 'push', getActionLabel(resp.action));
      } else {
        updateStatusUI({ state: 'error', detail: resp.error });
        addLog('error', resp.error);
      }
    } catch (e) {
      updateStatusUI({ state: 'error', detail: e.message });
      addLog('error', e.message);
    }

    syncBtn.disabled = false;
    pushBtn.disabled = false;
    pullBtn.disabled = false;
  }

  function getActionLabel(action) {
    const labels = {
      first_push: '首次同步，已上传',
      pushed: '已推送到坚果云',
      pushed_same_device: '本机数据已更新',
      pulled: '已从其他设备拉取',
      applied: '已应用云端数据',
      nothing: '无需同步',
      skip: '数据一致',
    };
    return labels[action] || action;
  }

  // ── 同步日志 ──

  function addLog(type, message) {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // 移除空状态
    const empty = syncLog.querySelector('.log-empty');
    if (empty) empty.remove();

    const item = document.createElement('div');
    item.className = 'log-item';
    item.innerHTML = `
      <span class="log-dot ${type}"></span>
      <span style="flex:1">${message}</span>
      <span class="log-time">${time}</span>
    `;

    syncLog.insertBefore(item, syncLog.firstChild);

    // 保留最多 20 条
    while (syncLog.children.length > 20) {
      syncLog.lastChild.remove();
    }

    // 保存到 storage
    saveLogs();
  }

  async function loadLogs() {
    const data = await chrome.storage.local.get('sync_logs');
    const logs = data.sync_logs || [];
    if (logs.length === 0) return;

    syncLog.innerHTML = '';
    for (const log of logs.slice(0, 10)) {
      const item = document.createElement('div');
      item.className = 'log-item';
      item.innerHTML = `
        <span class="log-dot ${log.type}"></span>
        <span style="flex:1">${log.message}</span>
        <span class="log-time">${log.time}</span>
      `;
      syncLog.appendChild(item);
    }
  }

  function saveLogs() {
    const items = syncLog.querySelectorAll('.log-item');
    const logs = Array.from(items).map(item => ({
      type: item.querySelector('.log-dot').className.replace('log-dot ', ''),
      message: item.querySelector('span:nth-child(2)').textContent,
      time: item.querySelector('.log-time').textContent,
    }));
    chrome.storage.local.set({ sync_logs: logs.slice(0, 20) });
  }

  // ── 监听 background 状态更新 ──

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'status-update') {
      updateStatusUI(msg.status);
    }
  });

  // ── 工具 ──

  function sendMessage(msg) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, resp => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(resp || {});
        }
      });
    });
  }
});
