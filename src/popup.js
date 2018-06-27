import Vue from 'vue/dist/vue.runtime.esm';
import antd from 'vue-antd-ui';
import 'vue-antd-ui/dist/antd.css';
import Octicon from 'vue-octicon/components/Octicon.vue';
import 'vue-octicon/icons';
import Popup from './components/Popup.vue';
import './popup.less';

Vue.use(antd);
Vue.component('octicon', Octicon);

global.vm = new Vue({
  el: '#app',
  render: h => h(Popup),
  components: { Popup },
});

