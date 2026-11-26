'use strict';
const $ = id => document.getElementById(id);
let selectedPlatform = /Win/i.test(navigator.platform || navigator.userAgent) ? 'windows' : 'macos';
const macInstallHTML = $('install-platform').innerHTML;
let releases = [], expanded = false, checksum = '', toastTimer;
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function readableSize(bytes) { return Number.isFinite(bytes) && bytes > 0 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : '大小以下载页为准'; }
function dateLabel(value) {
  if (!value || Number.isNaN(Date.parse(value))) return '本地版本';
  return new Intl.DateTimeFormat('zh-CN', {year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai'}).format(new Date(value)).replaceAll('/', '.');
}
function remoteLink(url) {
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && parsed.hostname === 'github.com' ? parsed.href : ''; }
  catch { return ''; }
}
function showToast(message) {
  $('toast').textContent = message; $('toast').classList.add('visible');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2800);
}
async function copy(text, message) {
  try {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const input = element('textarea'); input.value = text; input.className = 'clipboard-helper';
      document.body.append(input); input.select();
      const copied = document.execCommand('copy'); input.remove();
      if (!copied) throw Error('Clipboard unavailable');
    }
    showToast(message);
  } catch { showToast('复制失败，请手动复制地址栏中的链接或安装包校验值'); }
}
function notesOf(value) {
  return (value || '').split(/\n\s*\n/).flatMap(chunk => chunk.split(/\n(?=\s*\d+[.、)]\s)/))
    .map(line => line.replace(/^\s*(?:\d+[.、)]\s*|[-*•]\s+)/, '').replace(/[`*]/g, '').trim())
    .filter(Boolean);
}
function platformOf(file) { return file.platform || (/windows/i.test(file.name) ? 'windows' : 'macos'); }
function platformLabel(file) { return platformOf(file) === 'windows' ? 'Windows x64 · 测试版' : 'Mac Apple 芯片'; }
function renderVersions() {
  const query = $('release-search').value.trim().toLowerCase();
  const filtered = releases.filter(r => `${r.version} ${r.title} ${r.notes}`.toLowerCase().includes(query));
  const shown = query || expanded ? filtered : filtered.slice(0, 5);
  const list = $('release-list'); list.replaceChildren();
  if (!shown.length) list.append(element('p', query ? '没有找到匹配的版本，试试其他关键词。' : '暂时没有版本记录。将安装包放入 packages/版本号 目录即可。', 'empty'));
  for (const release of shown) {
    const details = element('details', undefined, 'release');
    details.open = !query && release === releases[0];
    const summary = element('summary');
    summary.append(element('span', `v${release.version}`, 'release-version'));
    if (release === releases[0]) summary.append(element('span', '最新版本', 'badge'));
    const title = (release.title || '').replace(/^AndroidADBTool\s*[\dv.]+\s*[·—-]?\s*/, '');
    if (title) summary.append(element('span', title, 'release-name'));
    summary.append(element('time', dateLabel(release.published), 'release-date'));
    const body = element('div', undefined, 'release-content');
    const notes = notesOf(release.notes);
    if (notes.length) {
      const ol = element('ol'); notes.forEach(note => ol.append(element('li', note))); body.append(ol);
    } else { body.append(element('p', '此安装包未附版本说明。', 'muted')); }
    const downloads = element('div', undefined, 'release-downloads');
    for (const file of release.files || []) {
      const link = element('a', `局域网下载 · ${platformLabel(file)}`); link.href = file.url; link.download = file.name;
      downloads.append(link, element('span', `${readableSize(file.size)} · SHA-256 已计算`, 'file-meta'));
    }
    if (!(release.files || []).length) {
      const assets = (release.assets || []).filter(a => remoteLink(a.url));
      for (const asset of assets) {
        const link = element('a', `GitHub 下载 · ${platformLabel(asset)}`); link.href = remoteLink(asset.url); link.target = '_blank'; link.rel = 'noopener';
        downloads.append(link, element('span', readableSize(asset.size), 'file-meta'));
      }
      if (!assets.length) downloads.append(element('span', '此版本暂无安装包', 'file-meta'));
    }
    const releaseURL = remoteLink(release.url);
    if (releaseURL) { const link = element('a', 'GitHub 版本详情 ↗'); link.href = releaseURL; link.target = '_blank'; link.rel = 'noopener'; downloads.append(link); }
    body.append(downloads); details.append(summary, body); list.append(details);
  }
  $('more-releases').hidden = Boolean(query) || filtered.length <= 5;
  $('more-releases').textContent = expanded ? '收起历史版本' : `展开其余 ${Math.max(0, filtered.length - 5)} 个版本`;
}
function renderDownload() {
  const win = selectedPlatform === 'windows', button = $('download-latest');
  for (const choice of document.querySelectorAll('[data-platform]')) choice.setAttribute('aria-pressed', String(choice.dataset.platform === selectedPlatform));
  $('windows-notes').hidden = !win;
  $('first-open-link').hidden = win;
  $('install-platform').replaceChildren();
  if (win) {
    $('install-platform').append(element('p', '下载 Windows ZIP，右键选择“全部解压缩”，再运行文件夹中的 AndroidADBTool.exe。保留所有 DLL、data、platform-tools 和 scrcpy 文件夹。'), element('span', '适用于 Windows 10 / 11 x64；请勿在压缩包中直接运行', 'step-note'));
  } else $('install-platform').innerHTML = macInstallHTML;
  $('update-instruction').textContent = win ? '更新：下载完整新版 ZIP，解压到新文件夹' : '更新入口：设置 → 应用更新';
  checksum = ''; $('copy-sha').hidden = true;
  button.removeAttribute('href'); button.removeAttribute('download'); button.classList.add('disabled'); button.setAttribute('aria-disabled', 'true');
  button.replaceChildren(element('span', win ? 'Windows 测试包尚未就绪' : '暂无 Mac 安装包'), element('span', '↓'));
  const latest = releases.find(r => [...(r.files || []), ...(r.assets || [])].some(f => platformOf(f) === selectedPlatform));
  $('download-meta').textContent = win ? 'Windows 10 / 11 · x64 · 完整 ZIP' : 'Apple 芯片 Mac · macOS 11+';
  if (!latest) {
    $('latest-tag').textContent = win ? 'Windows 测试版' : '等待添加安装包';
    $('download-detail').textContent = win ? (document.documentElement.dataset.distribution === 'bundled' ? 'Windows 测试版尚未提供公开下载，请向提供工具的同事获取完整 ZIP。' : '测试包完成构建后将在这里提供下载。') : '此系统暂无可用安装包。';
    return;
  }
  const file = (latest.files || []).find(f => platformOf(f) === selectedPlatform);
  const online = (latest.assets || []).find(f => platformOf(f) === selectedPlatform && remoteLink(f.url));
  $('latest-tag').textContent = `${win ? 'Windows 测试版' : '最新版本'} v${latest.version}   /   ${dateLabel(latest.published)}`;
  if (!file && !online) return;
  button.href = file ? file.url : remoteLink(online.url);
  button.classList.remove('disabled'); button.removeAttribute('aria-disabled');
  button.replaceChildren(element('span', file ? (win ? '下载 Windows 测试版' : '下载 Mac 安装包') : '前往 GitHub 下载'), element('span', '↓'));
  if (file) button.download = file.name;
  $('download-meta').textContent += ` · ${readableSize((file || online).size)}`;
  $('download-detail').textContent = file ? '从当前站点直接下载，无需访问 GitHub。' : '使用 GitHub 官方下载地址。';
  if (file) { checksum = file.sha256; $('copy-sha').hidden = false; }
}
for (const choice of document.querySelectorAll('[data-platform]')) choice.addEventListener('click', () => { selectedPlatform = choice.dataset.platform; renderDownload(); });
async function load() {
  try {
    const onGithub = document.documentElement.dataset.distribution === 'github';
    const response = await fetch(onGithub ? './api/releases.json' : '/api/releases', {cache: 'no-store'});
    if (!response.ok) throw Error('Request failed');
    releases = (await response.json()).releases;
    renderDownload();
    renderVersions();
    if (onGithub) refreshPublicReleases();
  } catch {
    $('latest-tag').textContent = '版本信息暂时不可用';
    $('download-detail').textContent = '请检查网络连接，刷新页面后重试。';
    $('release-list').replaceChildren(element('p', '读取版本记录失败。请刷新页面重试。', 'empty'));
  }
}
async function refreshPublicReleases() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch('https://api.github.com/repos/zj-kechangjie/android_tool_plus-updates/releases?per_page=30', {signal: controller.signal});
    if (!response.ok) return;
    const data = await response.json();
    if (!Array.isArray(data)) return;
    const updated = data.filter(r => !r.draft && !r.prerelease && /^v?\d+\.\d+\.\d+$/.test(r.tag_name)).map(r => ({
      version: r.tag_name.replace(/^v/, ''), title: r.name, published: r.published_at, notes: r.body || '', url: r.html_url, files: [],
      assets: (r.assets || []).filter(a => /\.dmg$/i.test(a.name) || /(?:^|[-_.])windows(?:[-_.]|$).*\.zip$/i.test(a.name) || /\.(exe|msi)$/i.test(a.name)).map(a => ({name: a.name, size: a.size, url: a.browser_download_url, platform: /\.dmg$/i.test(a.name) ? 'macos' : 'windows'}))
    }));
    if (updated.length) { releases = updated; renderDownload(); renderVersions(); }
  } catch { /* The published snapshot remains available when GitHub API is unavailable. */ }
  finally { clearTimeout(timer); }
}
const previews = {
  quick: {label: 'QUICK ACTIONS', title: '重复操作，一步到位。', description: '拖入 APK 即可安装，自定义常用功能与排序。截图后直接编辑，录屏后查看、裁剪与合并关键片段。', image: 'quick-actions.jpg', alt: '快捷功能真实界面'},
  logs: {label: 'LOGCAT', title: '让关键日志，更容易被找到。', description: '按应用和关键词筛选，查找高亮，保存筛选模板。选中复制需要的内容，或导出完整日志交给开发排查。', image: 'logcat.jpg', alt: 'LogCat 筛选、查找与日志采集真实界面'},
  repro: {label: 'ISSUE REPRODUCTION', title: '把问题，连同现场一起交付。', description: '同时记录视频与日志，在问题发生时标记时间点、保存截图。结束后导出问题包，减少口头描述和反复复现。', image: 'debug-workbench.jpg', alt: '问题复现与联合采集真实界面'}
};
const tabs = [...document.querySelectorAll('[data-preview]')];
function selectPreview(tab) {
  tabs.forEach(item => { item.setAttribute('aria-selected', String(item === tab)); item.tabIndex = item === tab ? 0 : -1; });
  const preview = previews[tab.dataset.preview];
  $('preview-panel').setAttribute('aria-labelledby', tab.id);
  $('preview-label').textContent = preview.label; $('preview-title').textContent = preview.title; $('preview-description').textContent = preview.description;
  $('preview-image').src = `./assets/${preview.image}`; $('preview-image').alt = preview.alt;
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectPreview(tab));
  tab.addEventListener('keydown', event => {
    let target;
    if (event.key === 'ArrowRight') target = tabs[(index + 1) % tabs.length];
    if (event.key === 'ArrowLeft') target = tabs[(index + tabs.length - 1) % tabs.length];
    if (event.key === 'Home') target = tabs[0];
    if (event.key === 'End') target = tabs[tabs.length - 1];
    if (target) { event.preventDefault(); selectPreview(target); target.focus(); }
  });
});
$('share-site').addEventListener('click', () => copy(`${location.origin}${location.pathname}${location.hash}`, '站点链接已复制'));
$('copy-sha').addEventListener('click', () => copy(checksum, 'SHA-256 校验值已复制'));
$('release-search').addEventListener('input', renderVersions);
$('more-releases').addEventListener('click', () => { expanded = !expanded; renderVersions(); });
load();

const siteTabs = [...document.querySelectorAll('[data-site-tab]')];
const sitePanels = [...document.querySelectorAll('.site-panel')];
let activeSiteTab = 'download';
function contentForHash() {
  if (/^#usage(?:-[a-zA-Z0-9_-]+)?$/.test(location.hash)) return 'usage';
  if (location.hash === '#versions') return 'versions';
  if (location.hash === '#main') return activeSiteTab;
  return 'download';
}
function renderSiteRoute() {
  activeSiteTab = contentForHash();
  for (const tab of siteTabs) {
    const selected = tab.dataset.siteTab === activeSiteTab;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const panel of sitePanels) panel.hidden = panel.id !== `${activeSiteTab}-panel`;
  const hash = location.hash;
  const target = document.getElementById(hash.slice(1));
  if (target instanceof HTMLDetailsElement) target.open = true;
  requestAnimationFrame(() => {
    if (target && !['#usage', '#versions', '#download', '#main'].includes(hash)) {
      target.scrollIntoView({behavior: 'instant', block: 'start'});
    } else {
      window.scrollTo({top: 0, behavior: 'instant'});
    }
  });
}
function selectSiteTab(tab) {
  const hash = `#${tab.dataset.siteTab}`;
  if (location.hash !== hash) history.pushState(null, '', hash);
  renderSiteRoute();
}
siteTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectSiteTab(tab));
  tab.addEventListener('keydown', event => {
    let target;
    if (event.key === 'ArrowRight') target = siteTabs[(index + 1) % siteTabs.length];
    if (event.key === 'ArrowLeft') target = siteTabs[(index + siteTabs.length - 1) % siteTabs.length];
    if (event.key === 'Home') target = siteTabs[0];
    if (event.key === 'End') target = siteTabs[siteTabs.length - 1];
    if (target) {event.preventDefault(); selectSiteTab(target); target.focus();}
  });
});
for (const link of document.querySelectorAll('.usage-index a, a[href="#mac-security"]')) {
  link.addEventListener('click', () => {
    const target = document.getElementById(link.hash.slice(1));
    if (target instanceof HTMLDetailsElement) target.open = true;
  });
}
window.addEventListener('hashchange', renderSiteRoute);
window.addEventListener('popstate', renderSiteRoute);
renderSiteRoute();
