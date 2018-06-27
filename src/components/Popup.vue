<template>
  <div class="popup-container">
    <header class="popup-header" v-if="openingSetting">
      <div class="ops back">
        <a-icon type="left" @click="closeSetting"  />
      </div>
      <div class="title">设置</div>
    </header>
    <header class="popup-header" v-else>
      <div class="title">正在进行的CI任务</div>
      <div class="ops">
        <a-icon :type="listStatus === 'loading' ? 'loading' : 'reload'" @click="refreshList" />
      </div>
    </header>
    <section class="popup-content" v-if="openingSetting">
      <a-form layout="vertical" class="setting-form">
        <a-form-item label="Gitlab 地址">
          <input class="ant-input" v-model="gitlabBaseUrl" />
        </a-form-item>
        <a-form-item label="Gitlab API 地址">
          <input class="ant-input" v-model="gitlabApiBaseUrl" />
        </a-form-item>
        <a-form-item label="你的 Access Token">
          <input class="ant-input" v-model="gitlabAccessToken" />
        </a-form-item>
        <a-form-item>
          <a-button style="width: 100%" @click="testAccessToken">
            <span>测试</span>
            <a-icon type="loading" v-if="accessTokenStatus === 'loading'" />
            <a-icon type="check" style="color: #52c41a;" v-if="accessTokenStatus === 'success'" />
            <a-icon type="close" style="color: #f5222d;" v-if="accessTokenStatus === 'failed'" />
          </a-button>
        </a-form-item>
        <a-button type="primary" style="width: 100%" @click="completeSetting">完成</a-button>
      </a-form>
    </section>
    <section class="popup-content" v-else>
      <div class="flex-column-center" v-if="!projects.length">
        <div v-if="!gitlabBaseUrl">
          点击右下方按钮配置Gitlab连接
        </div>
        <div v-else>
          暂时没有正在执行的任务
        </div>
      </div>
      <div class="project" v-for="project in projects" :key="project.id">
        <header>
          <div class="prop-item project-item"><octicon name="repo" /><span>{{project.owner}} / {{project.name}}</span></div>
        </header>
        <section class="pipeline" :class="pipeline.status" v-for="pipeline in project.pipelines" :key="pipeline.id">
          <a :href="pipeline.link" target="_blank">
            <img class="pipeline-status" src="assets/icons/icon_status_running.png" alt="[running]">
            <span>#{{pipeline.id}} - {{pipeline.branch}} ({{pipeline.commit}})</span>
          </a>
        </section>
      </div>
    </section>
    <footer class="popup-footer" v-if="!openingSetting">
      <div class="status">
        <div class="status-item status-running">
          <a-badge status="processing" />
          <span>{{runningCount}}</span>
        </div>
      </div>
      <div class="ops">
        <a-icon type="setting" @click="openSetting" />
      </div>
    </footer>
  </div>
</template>
<script>
import _ from 'lodash';
import axios from 'axios';
import bluebird from 'bluebird';
import moment from 'moment';

moment.locale('zh-CN');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const fetchAllPages = async (uri, params) => {
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
};

export default {
  mounted() {
    this.refreshList();
    this.timer = setInterval(() => {
      this.refreshList();
    }, 2000);
  },
  beforeDestroy() {
    clearInterval(this.timer);
  },
  methods: {
    relativeTime(time) {
      const m = moment(time);
      if (!m.isValid()) {
        return '';
      }
      return m.fromNow();
    },
    openSetting() {
      this.openingSetting = true;
      this.settingPanel = 1;
    },
    closeSetting() {
      this.openingSetting = false;
    },
    completeSetting() {
      this.openingSetting = false;
      this.refreshList();
    },
    refreshList() {
      if (this.listFetchId) {
        return;
      }
      this.listFetchId = Date.now();
      this.listStatus = 'loading';
      const base = this.gitlabApiBaseUrl &&
        `${this.gitlabApiBaseUrl.replace(/\/?$/, '')}`;
      const accessToken = this.gitlabAccessToken;
      const perPage = 100;

      const fetchPromise = fetchAllPages(`${base}/v4/projects`, {
        private_token: accessToken,
        per_page: perPage,
        membership: true,
        starred: true,
        simple: true,
      }).then((projects) => {
        console.log('starred projects', projects.map(p => p.path_with_namespace));

        return bluebird.map(
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
          ));
      }).then((pipelines) => {
        this.pipelines.length = 0;
        this.pipelines.push(...pipelines);
        return 'success';
      }, (err) => {
        console.error(err);
        this.$message('获取项目列表失败');
        return 'error';
      });

      Promise.all([fetchPromise, sleep(1000)]).then(([status]) => {
        this.listFetchId = null;
        this.listStatus = status;
      });
    },
    nextSettingPage() {
      if (this.settingPanel === 1) {
        if (this.accessTokenStatus !== 'success') {
          this.$message.error('你还尚未测试配置可用性');
          return;
        }
        this.fetchlist();
      }
      this.settingPanel += 1;
    },
    testAccessToken() {
      const uri =
        this.gitlabApiBaseUrl &&
        `${this.gitlabApiBaseUrl.replace(/\/?$/, '')}/v4/user`;
      const accessToken = this.gitlabAccessToken;
      this.accessTokenStatus = 'loading';
      axios.get(uri, {
        params: {
          private_token: accessToken,
        },
      }).then(() => {
        this.accessTokenStatus = 'success';
        this.$message.success('测试成功');
      }).catch(() => {
        this.accessTokenStatus = 'failed';
        this.$message.error('测试失败');
      });
    },
  },
  data() {
    return {
      timestamp: Date.now(),
      // openingSetting: true,
      // settingPanel: 2,
      openingSetting: false,
      settingPanel: 1,
      accessTokenStatus: '',
      fetchProjects: [],
      listFetchId: null,
      // listStatus: 'error',
      listStatus: 'loading',
      pipelines: [],
      timer: null,
    };
  },
  computed: {
    projects() {
      const { pipelines } = this;
      const projects = {};
      pipelines.forEach((pipeline) => {
        const projectId = pipeline.project.id;
        const [namespace, projectName] = pipeline.project.path_with_namespace.split('/');
        projects[projectId] = projects[projectId] || {
          id: projectId,
          owner: namespace,
          name: projectName,
          pipelines: [],
        };
        projects[projectId].pipelines.push({
          id: pipeline.id,
          branch: pipeline.ref,
          commit: pipeline.sha.slice(0, 6),
          link: `${this.gitlabBaseUrl.replace(/\/?$/, '')}/${pipeline.project.path_with_namespace}/pipelines/${pipeline.id}`,
          queueTime: new Date(pipeline.created_at),
          startTime: new Date(pipeline.started_at),
          status: pipeline.status,
        });
      });
      return _.values(projects);
    },
    listByNamespaces() {
      const groups = {};
      this.list.forEach((proj) => {
        const nsid = proj.namespace.id;
        const item = groups[nsid] || { namespace: proj.namespace, projects: [] };
        groups[nsid] = item;
        item.projects.push(proj);
      });
      const retval = _.values(groups);
      console.log(retval);
      return retval;
    },
    gitlabBaseUrl: {
      get() {
        const value = localStorage.getItem('gitlabBaseUrl');
        this.timestamp; // eslint-disable-line
        return value;
      },
      set(value) {
        localStorage.setItem('gitlabBaseUrl', value);
        this.timestamp = Date.now();
        return value;
      },
    },
    gitlabApiBaseUrl: {
      get() {
        let value = localStorage.getItem('gitlabApiBaseUrl');
        if (!value) {
          value = this.gitlabBaseUrl
            ? this.gitlabBaseUrl.replace(/\/?$/, '/api/')
            : undefined;
        }
        this.timestamp; // eslint-disable-line
        return value;
      },
      set(value) {
        localStorage.setItem('gitlabApiBaseUrl', value);
        this.timestamp = Date.now();
        return value;
      },
    },
    gitlabAccessToken: {
      get() {
        const value = localStorage.getItem('gitlabAccessToken');
        this.timestamp; // eslint-disable-line
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
      },
      set(value) {
        localStorage.setItem(
          'gitlabAccessToken',
          value &&
            value
              .split(/([aeiou])/i)
              .reverse()
              .join('')
              .split('')
              .reverse()
              .join(''),
        );
        this.timestamp = Date.now();
        return value;
      },
    },
    runningCount() {
      let count = 0;
      this.projects.forEach(p =>
        p.pipelines.forEach((pp) => {
          count += 1;
        }));
      return count;
    },
  },
};
</script>
<style lang="less" scoped>
@color-running: #91d5ff;
@color-waiting: #e8e8e8;
@color-success: #b7eb8f;
@color-failed: #ffa39e;

@keyframes running-twinkle {
  100% {
    background-color: #69c0ff;
  }
}

.flex-column-center {
  height: 100%; 
  display: flex; 
  flex-flow: column nowrap; 
  align-items: center; 
  justify-content: center;
  
  & > * {
    margin: 8px;
  }
}

.popup-container {
  display: flex;
  flex-flow: column nowrap;
  width: 320px;
  height: 320px;
  overflow: hidden;

  > section {
    flex: 1;
    overflow-y: auto;
  }

  .setting-form {
    padding: 12px;
  }

  .popup-header {
    display: flex;
    align-items: center;
    border-bottom: 1px solid #e8e8e8;
    padding: 12px;
    font-size: 1rem;

    .title {
      flex: 1;
    }

    .ops.back {
      margin-right: 12px;
    }
  }
  .project {
    > header {
      padding: 12px;
    }

    > section {
      padding: 12px;
      padding-left: 0;
      margin-left: 12px;
      border-top: 1px solid #e8e8e8;
    }
  }
  .pipeline {
    .pipeline-status {
      width: 16px;
      height: 16px;
      margin-bottom: 3px;
    }
    a {
      color: rgba(0, 0, 0, 0.65);;
    }
  }
  .pipeline + .pipeline {
    border-top: 1px solid #e8e8e8;
  }
  .project-list-item {
    display: flex;
    align-items: center;
    border-top: 1px solid #e8e8e8;
    padding: 8px 16px 8px 0;
    margin-right: -16px;

    &:last-child {
      margin-bottom: -16px;
    }
 
    .project-info {
      flex: 1 1 auto;
      word-break: break-all;

      .project-id {
        color: #cccccc;
        font-size: 0.7rem;
      }
      .project-path {
        color: #333333;
        font-size: 0.9rem;
      }

      .project-description {
        font-size: 0.7rem;
        line-height: 1rem;
        min-height: 1rem;
        color: #999;
      }
    }

    .project-ops {
      flex: 0 0 auto;
      margin-left: 16px;
    }
  }
  .prop-item {
    position: relative;
    align-items: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-left: 20px;

    .octicon {
      position: absolute;
      left: 0;
      top: 2px;
      width: 16px;
      height: 16px;
    }
  }
  .popup-footer {
    display: flex;
    align-items: center;
    border-top: 1px solid #e8e8e8;
    padding: 12px;
    font-size: 1rem;

    .status {
      display: flex;
      align-items: center;
      flex: 1;
      font-size: 0.8rem;

      user-select: none;
      cursor: default;

      .status-item + .status-item {
        margin-left: 12px;
        padding-left: 12px;
        border-left: 1px solid #e8e8e8;
      }
    }
  }
}
span.sharp {
  display: inline-block;
  margin-right: 4px;
  width: 16px;
  font-size: 16px;
  font-weight: bolder;
  text-align: center;
}
.octicon {
  display: inline-block;
  font-style: normal;
  vertical-align: baseline;
  text-align: center;
  text-transform: none;
  line-height: 1;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}
.ant-form-item {
  margin-bottom: 8px;
}
</style>
