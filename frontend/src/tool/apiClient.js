function getCookie(name) {
  return document.cookie.split('; ').find((item) => item.startsWith(`${name}=`))?.split('=').slice(1).join('')
}

export async function requestJson(url, options = {}) {
  const headers = new Headers(options.headers) // Lấy header nếu có
  const method = (options.method || 'GET').toUpperCase()
  if (!['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method)) {
    if (!getCookie('csrftoken')) await fetch('/api/auth/csrf/', { credentials: 'same-origin' })
    const token = getCookie('csrftoken')
    if (token) headers.set('X-CSRFToken', decodeURIComponent(token))
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(url, { ...options, headers, credentials: 'same-origin' }) // Gửi request tới Backend
  const data = await response.json().catch(() => ({})) // Chuyển kết quả thành JSON

  if (!response.ok || data.success === false) {
    throw new Error(data.message || `Lỗi HTTP ${response.status}`) // Báo lỗi nếu API thất bại
  }

  return data // Trả dữ liệu về cho nơi gọi
}
