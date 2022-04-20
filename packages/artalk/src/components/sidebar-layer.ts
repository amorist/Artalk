import '../style/sidebar-layer.less'

import Context from '@/context'
import Component from '@/lib/component'
import * as Utils from '@/lib/utils'
import SidebarHTML from './html/sidebar-layer.html?raw'
import * as Ui from '@/lib/ui'
import Layer from './layer'
import Api from '../api'
import { SidebarShowPayload } from '~/types/event'

export default class SidebarLayer extends Component {
  public layer?: Layer
  public $header: HTMLElement
  public $closeBtn: HTMLElement
  public $iframeWrap: HTMLElement
  public $iframe?: HTMLIFrameElement

  constructor(ctx: Context) {
    super(ctx)

    this.$el = Utils.createElement(SidebarHTML)
    this.$header = this.$el.querySelector('.atk-sidebar-header')!
    this.$closeBtn = this.$header.querySelector('.atk-sidebar-close')!
    this.$iframeWrap = this.$el.querySelector('.atk-sidebar-iframe-wrap')!

    this.$closeBtn.onclick = () => {
      this.hide()
    }

    // event
    this.ctx.on('sidebar-show', (conf) => (this.show(conf || {})))
    this.ctx.on('sidebar-hide', () => (this.hide()))
    this.ctx.on('user-changed', () => { this.firstShow = true })
  }

  private firstShow = true

  /** 显示 */
  public async show(conf: SidebarShowPayload) {
    this.$el.style.transform = '' // 动画清除，防止二次打开失效

    // 获取 Layer
    if (this.layer == null) {
      this.layer = new Layer(this.ctx, 'sidebar', this.$el)
      this.layer.afterHide = () => {
        // 防止评论框被吞
        if (this.ctx.conf.editorTravel === true) {
          this.ctx.trigger('editor-travel-back')
        }
      }
    }
    this.layer.show()

    // viewWrap 滚动条归位
    // this.$viewWrap.scrollTo(0, 0)

    // 执行动画
    setTimeout(() => {
      this.$el.style.transform = 'translate(0, 0)'
    }, 20)

    // 管理员身份验证 (若身份失效，弹出验证窗口)
    ;(async () => {
      const resp = await new Api(this.ctx).loginStatus()
      if (resp.is_admin && !resp.is_login) {
        this.layer?.hide()
        this.firstShow = true

        this.ctx.trigger('checker-admin', {
          onSuccess: () => {
            setTimeout(() => {
              this.show(conf)
            }, 500)
          },
          onCancel: () => {}
        })
      }
    })()

    // 清空 unread
    this.ctx.trigger('unread-update', { notifies: [] })

    // 第一次加载
    if (this.firstShow) {
      this.$iframeWrap.innerHTML = ''
      this.$iframe = Utils.createElement<HTMLIFrameElement>('<iframe></iframe>')

      // 准备 Iframe 参数
      const baseURL = (import.meta.env.MODE === 'development')  ? 'http://localhost:23367/'
        : Utils.getURLBasedOnApi(this.ctx, '/sidebar/')

      const query: any = {
        pageKey: this.conf.pageKey,
        site: this.conf.site || '',
        user: JSON.stringify(this.ctx.user.data),
        time: +new Date()
      }

      if (conf.view) query.view = conf.view
      if (this.conf.darkMode) query.darkMode = '1'

      const urlParams = new URLSearchParams(query);
      this.iframeLoad(`${baseURL}?${urlParams.toString()}`)

      this.$iframeWrap.append(this.$iframe)
      this.firstShow = false
    } else {
      // 暗黑模式
      const isIframeSrcDarkMode = this.$iframe!.src.includes('darkMode=1')

      if (this.conf.darkMode && !isIframeSrcDarkMode)
        this.iframeLoad(`${this.$iframe!.src}&darkMode=1`)

      if (!this.conf.darkMode && isIframeSrcDarkMode)
        this.iframeLoad(this.$iframe!.src.replace('&darkMode=1', ''))
    }
  }

  /** 隐藏 */
  public hide() {
    // 执行动画
    this.$el.style.transform = ''

    this.layer?.hide()
  }

  public iframeLoad(src: string) {
    if (!this.$iframe) return

    this.$iframe.src = src

    // 加载动画
    Ui.showLoading(this.$iframeWrap)
    this.$iframe.onload = () => {
      Ui.hideLoading(this.$iframeWrap)
    }

    // this.checkReqStatus(src) // 判不准，删了，没啥用
  }

  loadingTimer: number|null = null

  // 测试可访问性 (由于 iframe 测不准，需要额外请求)
  public async checkReqStatus(url: string) {
    if (this.loadingTimer !== null) window.clearTimeout(this.loadingTimer)

    this.loadingTimer = window.setTimeout(async () => {
      try {
        await fetch(url)
      } catch (err) {
        console.log(err)
        // 请求失败，显示错误提示
        const $errAlert = Utils.createElement(
          `<div class="atk-err-alert">` +
          `  <div class="atk-title">侧边栏似乎打开失败</div>` +
          `  <div class="atk-text"><span id="AtkReload">重新加载</span> / <span id="AtkCancel">取消</span></div>` +
          `</div>`
        )
        const $reloadBtn = $errAlert.querySelector<HTMLElement>('#AtkReload')!
        const $cancelBtn = $errAlert.querySelector<HTMLElement>('#AtkCancel')!
        $reloadBtn.onclick = () => {
          this.iframeLoad(url)
          $errAlert.remove()
        }
        $cancelBtn.onclick = () => { // 提供取消按钮，防止误判
          $errAlert.remove()
        }
        this.$iframeWrap.append($errAlert)
      }
    }, 2000) // 2s 后开始检测
  }
}