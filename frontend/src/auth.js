import { requestJson } from './tool/apiClient.js'

const API = '/api/auth'

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char])
}

function field(name, label, type = 'text', autocomplete = '', required = true, value = '') {
  const valueAttribute = type === 'password' ? '' : `value="${escapeHtml(value)}"`
  return `<label class="auth-field">${label}<input name="${name}" type="${type}" autocomplete="${autocomplete}" ${required ? 'required' : ''} ${valueAttribute}></label>`
}

function post(path, body) {
  return requestJson(`${API}/${path}/`, { method: 'POST', body: JSON.stringify(body) })
}

export function createAuthUi() {
  const dialog = document.createElement('dialog')
  dialog.className = 'auth-dialog'
  document.body.append(dialog)
  const avatar = document.querySelector('[data-account-toggle]')
  const popup = document.querySelector('[data-account-popup]')
  let currentUser = null

  function initials(name) {
    return name.split(' ').filter(Boolean).slice(-2).map((part) => part[0]).join('').toUpperCase() || '?'
  }

function setAccountRole(user = null) {
  currentUser = user
  const role = user?.role || 'guest'
  const fullName = user?.full_name || ''
  const details = {
    guest: { avatar: '?', title: 'Khách', label: 'Chưa đăng nhập' },
    student: { avatar: initials(fullName), title: fullName, label: 'Học viên' },
    admin: { avatar: initials(fullName), title: fullName, label: 'Quản trị viên' },
  }[role]
  document.body.dataset.role = role
  document.querySelector('[data-avatar-label]').textContent = details.avatar
  document.querySelector('[data-popup-avatar]').textContent = details.avatar
  document.querySelectorAll('[data-avatar-image], [data-popup-image]').forEach((image) => {
    image.hidden = !user?.avatar
    if (user?.avatar) image.src = user.avatar
  })
  document.querySelector('[data-avatar-label]').hidden = Boolean(user?.avatar)
  document.querySelector('[data-popup-avatar]').hidden = Boolean(user?.avatar)
  document.querySelector('[data-account-title]').textContent = details.title
  document.querySelector('[data-account-role]').textContent = details.label
  document.querySelectorAll('[data-account-menu]').forEach((menu) => {
    menu.hidden = menu.dataset.accountMenu !== role
  })
}

  function open(view = 'login', profile = {}) {
    const isRegister = view === 'register'
    const isProfile = view === 'profile'
    const isPassword = view === 'change-password'
    const avatarField = `<label class="auth-avatar-field"><img class="auth-avatar-preview" data-avatar-preview ${profile.avatar ? `src="${escapeHtml(profile.avatar)}"` : ''} alt="Ảnh đại diện"><span>Nhấn để chọn ảnh đại diện<br><small>PNG, JPG hoặc JPEG · tối đa 2 MB</small></span><input name="avatar" type="file" accept="image/png,image/jpeg"></label>`
    const form = isProfile
      ? `${avatarField}${field('full_name', 'Họ và tên', 'text', 'name', true, profile.full_name)}${field('student_code', 'Mã học viên', 'text', 'off', false, profile.student_code)}${field('class_name', 'Lớp', 'text', 'off', false, profile.class_name)}${field('phone', 'Số điện thoại', 'tel', 'tel', false, profile.phone)}${field('email', 'Email', 'email', 'email', true, profile.email)}`
      : isPassword
        ? `${field('current_password', 'Mật khẩu hiện tại', 'password', 'current-password')}${field('new_password', 'Mật khẩu mới', 'password', 'new-password')}${field('confirm_password', 'Xác nhận mật khẩu mới', 'password', 'new-password')}`
        : isRegister
      ? `${field('full_name', 'Họ và tên', 'text', 'name')}${field('student_code', 'Mã học viên', 'text', 'off', false)}${field('class_name', 'Lớp', 'text', 'off', false)}${field('phone', 'Số điện thoại', 'tel', 'tel', false)}${field('email', 'Email', 'email', 'email')}${field('username', 'Tên đăng nhập', 'text', 'username')}${field('password', 'Mật khẩu', 'password', 'new-password')}`
      : `${field('username', 'Tên đăng nhập', 'text', 'username')}${field('password', 'Mật khẩu', 'password', 'current-password')}`
    const title = isProfile ? 'Thông tin cá nhân' : isPassword ? 'Đổi mật khẩu' : isRegister ? 'Tạo tài khoản học viên' : 'Chào mừng trở lại'
    const intro = isProfile ? 'Cập nhật thông tin để hồ sơ luôn chính xác.' : isPassword ? 'Sử dụng mật khẩu mạnh và không chia sẻ với người khác.' : isRegister ? 'Tài khoản mới sẽ được cấp quyền Học viên.' : 'Đăng nhập để tiếp tục sử dụng hệ thống.'
    const submitLabel = isProfile ? 'Lưu thay đổi' : isPassword ? 'Đổi mật khẩu' : isRegister ? 'Đăng ký' : 'Đăng nhập'
    dialog.innerHTML = `
      <div class="auth-shell">
        <aside class="auth-aside">
          <div class="auth-brand"><b>PTN</b><span>PTN WebGIS<small>Hệ thống thực hành GIS</small></span></div>
          <div class="auth-aside-copy"><span>KHÔNG GIAN SỐ</span><h2>Dữ liệu rõ ràng.<br>Bản đồ trực quan.</h2><p>Truy cập không gian làm việc và dữ liệu địa lý của bạn một cách an toàn.</p></div>
          <ul><li>Bản đồ tương tác</li><li>Dữ liệu được phân quyền</li><li>Công cụ GIS tập trung</li></ul>
        </aside>
        <div class="auth-card">
          <button type="button" class="auth-close" aria-label="Đóng" data-auth-close>×</button>
          <p class="auth-kicker">PTN WEBGIS</p><h1>${title}</h1>
          <p class="auth-intro">${intro}</p>
          <form data-auth-form="${view}">${form}<button type="submit" class="auth-submit">${submitLabel}</button></form>
          ${isProfile || isPassword ? '' : `<div class="auth-links"><button type="button" data-auth-view="${isRegister ? 'login' : 'register'}">${isRegister ? 'Đã có tài khoản? Đăng nhập' : 'Tạo tài khoản học viên'}</button><button type="button" data-account-action="forgot">Quên mật khẩu?</button></div>`}
          <p class="auth-status" data-auth-status></p>
        </div>
      </div>`
    if (!dialog.open) dialog.showModal()
    dialog.querySelector('input')?.focus()
  }

  function closePopup() {
    popup.hidden = true
    avatar.setAttribute('aria-expanded', 'false')
  }

  avatar.addEventListener('click', () => {
    const isOpen = !popup.hidden
    popup.hidden = isOpen
    avatar.setAttribute('aria-expanded', String(!isOpen))
  })
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.account-control')) closePopup()
  })
  popup.addEventListener('click', async (event) => {
    const action = event.target.closest('[data-account-action]')?.dataset.accountAction
    if (!action) return
    closePopup()
    if (action === 'login' || action === 'register') return open(action)
    try {
      if (action === 'logout') {
        await post('logout', {})
        return setAccountRole()
      }
      if (action === 'profile') {
        const data = await requestJson(`${API}/profile/`)
        return open('profile', data.profile)
      }
      if (action === 'change-password') return open('change-password')
    } catch (error) {
      return document.dispatchEvent(new CustomEvent('ptn-account-action', { detail: { action: 'error', message: error.message } }))
    }
    document.dispatchEvent(new CustomEvent('ptn-account-action', { detail: { action } }))
  })
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target.closest('[data-auth-close]')) dialog.close()
    const view = event.target.dataset.authView
    if (view) open(view)
    if (event.target.dataset.accountAction === 'forgot') {
      document.dispatchEvent(new CustomEvent('ptn-account-action', { detail: { action: 'forgot' } }))
    }
  })
  dialog.addEventListener('change', (event) => {
    if (event.target.name !== 'avatar') return
    const file = event.target.files[0]
    if (file) dialog.querySelector('[data-avatar-preview]').src = URL.createObjectURL(file)
  })
  dialog.addEventListener('submit', async (event) => {
    event.preventDefault()
    const form = event.target
    const submit = form.querySelector('[type="submit"]')
    submit.disabled = true
    try {
      const view = form.dataset.authForm
      const formData = new FormData(form)
      const payload = Object.fromEntries(formData)
      if (view === 'change-password' && payload.new_password !== payload.confirm_password) throw new Error('Xác nhận mật khẩu mới chưa khớp.')
      delete payload.confirm_password
      const data = view === 'profile'
        ? await requestJson(`${API}/profile/`, { method: 'POST', body: formData })
        : await post(view, payload)
      if (data.user) setAccountRole(data.user)
      dialog.close()
    } catch (error) {
      dialog.querySelector('[data-auth-status]').textContent = error.message
      dialog.querySelector('[data-auth-status]').classList.add('error')
    } finally {
      submit.disabled = false
    }
  })

  requestJson(`${API}/csrf/`)
    .then(() => requestJson(`${API}/me/`))
    .then((data) => setAccountRole(data.user))
    .catch(() => setAccountRole())
  return { getUser: () => currentUser }
}
