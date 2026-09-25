import { createToolPanel } from './toolUtils.js'
import { requestJson } from './apiClient.js'

function setServiceStatus(element, name, online, detail = '') {
  element.className = `system-service ${online ? 'online' : 'offline'}`
  element.textContent = `${name}: ${online ? 'Đang hoạt động' : 'Không kết nối được'}${detail ? ` (${detail})` : ''}`
}

export function createSystemTools() {
  const supportPanel = createToolPanel({
    id: 'support-panel',
    title: 'Hỗ trợ sử dụng',
    content: `
      <p class="tool-hint">Chọn công cụ trên thanh bên phải để thao tác với bản đồ.</p>
      <ul class="system-list">
        <li><strong>Mục lục lớp:</strong> bật/tắt và sắp xếp lớp dữ liệu.</li>
        <li><strong>Đo đạc:</strong> đo chiều dài hoặc diện tích trực tiếp trên bản đồ.</li>
        <li><strong>Tìm kiếm:</strong> nhập địa danh hoặc tọa độ WGS84/VN-2000.</li>
        <li><strong>Tra cứu:</strong> chọn lớp rồi nhấp bản đồ để xem thuộc tính hoặc pixel raster.</li>
      </ul>
      <strong>Trạng thái dịch vụ</strong>
      <div class="system-services" data-support-services>Đang kiểm tra…</div>
      <button type="button" class="secondary" data-refresh-support>Làm mới trạng thái</button>
    `,
  })
  supportPanel.dataset.sectionAction = 'support'

  const adminPanel = createToolPanel({
    id: 'admin-panel',
    title: 'Quản trị hệ thống',
    content: `
      <p class="tool-hint">Theo dõi hệ thống và quản lý vai trò người dùng.</p>
      <div class="system-services" data-admin-services>Đang kiểm tra…</div>
      <div class="system-metrics" data-admin-metrics>Đang tải số liệu…</div>
      <hr>
      <strong>Quản lý người dùng</strong>
      <div class="admin-user-filter">
        <input data-admin-user-search placeholder="Tên, email, mã học viên...">
        <select data-admin-user-role>
          <option value="">Tất cả vai trò</option>
          <option value="student">Học viên</option>
          <option value="admin">Quản trị viên</option>
        </select>
      </div>
      <button type="button" class="secondary" data-load-admin-users>Tìm người dùng</button>
      <p class="tool-hint" data-admin-user-status></p>
      <div class="admin-user-list" data-admin-user-list></div>
      <button type="button" class="secondary" data-refresh-admin>Làm mới tổng quan</button>
    `,
  })

  async function checkServices(container) {
    const backend = document.createElement('div')
    const geoserver = document.createElement('div')
    container.replaceChildren(backend, geoserver)
    setServiceStatus(backend, 'Backend', false, 'đang kiểm tra')
    setServiceStatus(geoserver, 'GeoServer', false, 'đang kiểm tra')

    const [backendResult, geoserverResult] = await Promise.allSettled([
      fetch('/api/health/').then((response) => response.ok),
      fetch('/geoserver/web/', { method: 'HEAD' }).then((response) => response.ok),
    ])
    setServiceStatus(backend, 'Backend', backendResult.status === 'fulfilled' && backendResult.value)
    setServiceStatus(geoserver, 'GeoServer', geoserverResult.status === 'fulfilled' && geoserverResult.value)
  }

  async function loadAdminOverview() {
    const metrics = adminPanel.querySelector('[data-admin-metrics]')
    metrics.textContent = 'Đang tải số liệu…'
    try {
      const { overview } = await requestJson('/api/auth/admin/overview/')
      metrics.replaceChildren(...[
        `Cơ sở dữ liệu: ${overview.database_online ? 'Đang hoạt động' : 'Không kết nối được'}`,
        `Tài khoản: ${overview.student_count} học viên · ${overview.admin_count} quản trị viên`,
        `Raster đã đăng ký: ${overview.raster_count}`,
      ].map((text) => {
        const item = document.createElement('div')
        item.className = 'system-metric'
        item.textContent = text
        return item
      }))
    } catch (error) {
      metrics.textContent = error.message
    }
  }

  function renderUsers(users) {
    const list = adminPanel.querySelector('[data-admin-user-list]')
    list.replaceChildren()
    if (!users.length) {
      list.textContent = 'Không tìm thấy người dùng phù hợp.'
      return
    }
    users.forEach((user) => {
      const row = document.createElement('article')
      row.className = 'admin-user-row'
      const details = document.createElement('div')
      const title = document.createElement('strong')
      title.textContent = `${user.full_name} (${user.username})`
      const info = document.createElement('small')
      info.textContent = [user.email, user.student_code, user.class_name].filter(Boolean).join(' · ') || 'Chưa có thông tin bổ sung'
      details.append(title, info)
      const controls = document.createElement('div')
      controls.className = 'admin-user-controls'
      const role = document.createElement('select')
      role.append(new Option('Học viên', 'student'), new Option('Quản trị viên', 'admin'))
      role.value = user.role
      const save = document.createElement('button')
      save.type = 'button'
      save.textContent = 'Cập nhật'
      save.addEventListener('click', async () => {
        save.disabled = true
        try {
          await requestJson(`/api/auth/admin/users/${user.id}/role/`, {
            method: 'PUT',
            body: JSON.stringify({ role: role.value }),
          })
          await loadAdminUsers()
          loadAdminOverview()
        } catch (error) {
          adminPanel.querySelector('[data-admin-user-status]').textContent = error.message
        } finally {
          save.disabled = false
        }
      })
      controls.append(role, save)
      row.append(details, controls)
      list.appendChild(row)
    })
  }

  async function loadAdminUsers() {
    const status = adminPanel.querySelector('[data-admin-user-status]')
    const keyword = adminPanel.querySelector('[data-admin-user-search]').value.trim()
    const role = adminPanel.querySelector('[data-admin-user-role]').value
    status.textContent = 'Đang tải người dùng…'
    try {
      const query = new URLSearchParams()
      if (keyword) query.set('q', keyword)
      if (role) query.set('role', role)
      const { users } = await requestJson(`/api/auth/admin/users/?${query}`)
      renderUsers(users)
      status.textContent = `Hiển thị ${users.length} người dùng.`
    } catch (error) {
      adminPanel.querySelector('[data-admin-user-list]').replaceChildren()
      status.textContent = error.message
    }
  }

  function closeAll(except = '') {
    if (except !== 'support') supportPanel.classList.remove('shown')
    if (except !== 'admin') adminPanel.classList.remove('shown')
  }

  function openSupport() {
    document.dispatchEvent(new CustomEvent('ptn-tool-activate', { detail: { name: 'support' } }))
    closeAll('support')
    supportPanel.classList.add('shown')
    checkServices(supportPanel.querySelector('[data-support-services]'))
  }

  function openAdmin() {
    document.dispatchEvent(new CustomEvent('ptn-tool-activate', { detail: { name: 'admin' } }))
    closeAll('admin')
    adminPanel.classList.add('shown')
    checkServices(adminPanel.querySelector('[data-admin-services]'))
    loadAdminOverview()
    loadAdminUsers()
  }

  supportPanel.querySelector('[data-refresh-support]').addEventListener('click', () => {
    checkServices(supportPanel.querySelector('[data-support-services]'))
  })
  adminPanel.querySelector('[data-refresh-admin]').addEventListener('click', () => {
    checkServices(adminPanel.querySelector('[data-admin-services]'))
    loadAdminOverview()
  })
  adminPanel.querySelector('[data-load-admin-users]').addEventListener('click', loadAdminUsers)
  document.addEventListener('ptn-tool-activate', (event) => closeAll(event.detail?.name))

  return { openSupport, openAdmin }
}
