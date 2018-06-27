import _ from 'lodash';
import axios from 'axios';
import bluebird from 'bluebird';
import moment from 'moment';

moment.locale('zh-CN');

const MAX_LINKS = 50;

function getGitlabBaseUrl() {
  const value = localStorage.getItem('gitlabBaseUrl');
  return value && value.replace(/\/?$/, '');
}

function getGitlabApiBaseUrl() {
  let value = localStorage.getItem('gitlabApiBaseUrl');
  if (!value) {
    const gitlabBaseUrl = getGitlabBaseUrl();
    value = gitlabBaseUrl
      ? `${gitlabBaseUrl}/api`
      : undefined;
  }
  return value && value.replace(/\/?$/, '');
}

function getGitlabAccessToken() {
  const value = localStorage.getItem('gitlabAccessToken');
  return (
    value &&
    value
      .split('')
      .reverse()
      .join('')
      .split(/([aeiou]+)/i)
      .reverse()
      .join('')
  );
}

function setNotificationLink(id, url) {
  const linkId = `link_${id}`;
  localStorage.setItem(linkId, url);
  const links = _.compact((localStorage.getItem('links') || '').split(','));
  links.push(linkId);
  const discardLinks = [];
  while (links.length > MAX_LINKS) {
    discardLinks.push(links.shift());
  }
  localStorage.setItem('links', links.join(','));
  discardLinks.forEach((link) => {
    localStorage.removeItem(link);
  });
}

async function fetchAllPages(uri, params) {
  let page = 1;
  const perPage = 100;
  let response;
  const result = [];
  do {
    response = await axios.get(uri, {
      params: Object.assign({}, params, { page }),
    }).then(res => res.data);
    response.forEach(item => result.push(item));
    page += 1;
  } while (response.length === perPage);
  return result;
}

function fetchRunningPipelines() {
  const base = getGitlabApiBaseUrl();
  const accessToken = getGitlabAccessToken();
  const perPage = 100;

  return fetchAllPages(`${base}/v4/projects`, {
    private_token: accessToken,
    per_page: perPage,
    membership: true,
    starred: true,
    simple: true,
  }).then(projects => bluebird.map(
    projects,
    project => fetchAllPages(`${base}/v4/projects/${project.id}/pipelines`, {
      private_token: accessToken,
      per_page: perPage,
      scope: 'running',
    }).then(pipelines => pipelines.map(pipeline => Object.assign(pipeline, { project }))),
  )
    .then(_.flatten)
    .then(pipelines => bluebird.map(
      pipelines,
      pipeline => axios(`${base}/v4/projects/${pipeline.project.id}/pipelines/${pipeline.id}`, {
        params: { private_token: accessToken },
      }).then(res => Object.assign(res.data, { project: pipeline.project })),
    )));
}

let running = false;
let last = [];
const notified = new Set();

function checkPipelines() {
  if (running) { return; }
  const base = getGitlabApiBaseUrl();
  const accessToken = getGitlabAccessToken();
  if (!base || !accessToken) { return; }

  running = true;
  fetchRunningPipelines().then(async (pipelines) => {
    console.log('正在执行的任务数量', pipelines.length);
    const runningIds = new Set(pipelines.map(p => p.id));

    // 需要发送开始通知的
    const started = pipelines.filter(pipeline => !notified.has(pipeline.id));
    started.forEach((pipeline) => {
      chrome.notifications.create('', {
        type: 'list',
        title: `${pipeline.project.path_with_namespace} 有新的任务正在执行`,
        message: '点击打开Gitlab页面',
        items: [{
          title: `#${pipeline.id}`,
          message: `${pipeline.ref} (${pipeline.sha.slice(0, 6)})`,
        }],
        iconUrl: 'assets/icons/icon_running.png',
      }, (id) => {
        const url = `${getGitlabBaseUrl()}/${pipeline.project.path_with_namespace}/pipelines/${pipeline.id}`;
        setNotificationLink(id, url);
      });
      notified.add(pipeline.id);
    });

    // 需要发送结束通知的
    const ended = last.filter(p => !runningIds.has(p.id));
    last = pipelines;
    const endedPipelines = await bluebird.map(ended, pipeline => axios(`${base}/v4/projects/${pipeline.project.id}/pipelines/${pipeline.id}`, {
      params: {
        private_token: accessToken,
      },
    }).then(res => Object.assign(res.data, { project: pipeline.project })));
    endedPipelines.forEach((pipeline) => {
      const status = {
        success: '执行成功',
        failed: '执行失败',
        canceled: '被取消',
        skipped: '被跳过',
      }[pipeline.status];
      const icon = {
        success: 'assets/icons/icon_success.png',
        failed: 'assets/icons/icon_failed.png',
        canceled: 'assets/icons/icon_canceled.png',
        skipped: 'assets/icons/icon_skipped.png',
      }[pipeline.status];

      if (status) {
        chrome.notifications.create('', {
          type: 'list',
          title: `${pipeline.project.path_with_namespace} 任务${status}`,
          message: '点击打开Gitlab页面',
          items: [{
            title: `#${pipeline.id}`,
            message: `${pipeline.ref} (${pipeline.sha.slice(0, 6)})`,
          }],
          iconUrl: icon,
        }, (id) => {
          const url = `${getGitlabBaseUrl()}/${pipeline.project.path_with_namespace}/pipelines/${pipeline.id}`;
          setNotificationLink(id, url);
        });
      }
    });
  }, (err) => {
    console.error('获取列表出错', err);
  }).then(() => {
    running = false;
  });
}

chrome.notifications.onClosed.addListener((id) => {
  localStorage.removeItem(`link_${id}`);
});

chrome.notifications.onClicked.addListener((id) => {
  const url = localStorage.getItem(`link_${id}`);
  if (url) {
    console.log('点击推送消息', id, '打开页面', url);
    chrome.windows.getLastFocused({ windowTypes: ['normal'] }, (lastFocusedWindow) => {
      if (lastFocusedWindow) {
        chrome.tabs.create({
          url,
          windowId: lastFocusedWindow.id,
        });
      } else {
        chrome.windows.create({
          url,
          type: 'normal',
          focused: true,
        });
      }
    });
  } else {
    console.log('点击推送消息', id, '未找到页面链接');
  }
  chrome.notifications.clear(id, () => {});
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'check-pipelines') {
    checkPipelines();
  }
});

chrome.alarms.create('check-pipelines', { periodInMinutes: 1 });

setInterval(checkPipelines, 2000);
