// Tiện ích chung để mọi panel công cụ có cùng cách mở, đóng và kéo thả.
export function createToolPanel({ id, title, content }) {
  const panel = document.createElement('section')
  panel.id = id
  panel.className = 'tool-panel'
  panel.innerHTML = `
    <header class="tool-panel-header">
      <strong>${title}</strong>
      <button type="button" aria-label="Đóng">×</button>
    </header>
    <div class="tool-panel-body">${content}</div>
  `
  document.querySelector('#tool-panels').appendChild(panel)
  restorePanelPosition(panel)
  panel.querySelector('header').addEventListener('pointerdown', makeDraggable(panel))
  panel.querySelector('header button').addEventListener('click', () => {
    panel.classList.remove('shown')
    panel.dispatchEvent(new CustomEvent('toolpanelclose', { bubbles: true }))
  })
  return panel
}

let highestPanelZIndex = 20

function positionKey(panel) {
  return `ptn-panel-position:${panel.id}`
}

function restorePanelPosition(panel) {
  try {
    const position = JSON.parse(localStorage.getItem(positionKey(panel)))
    if (!position || !Number.isFinite(position.left) || !Number.isFinite(position.top)) return
    panel.style.left = `${position.left}px`
    panel.style.top = `${position.top}px`
    panel.style.right = 'auto'
  } catch {
    // Không để trạng thái trình duyệt cũ ảnh hưởng tới việc mở công cụ.
  }
}

function clampPanelPosition(panel, left, top) {
  const container = panel.closest('.map-panel')
  if (!container) return { left, top }
  const padding = 8
  const maxLeft = Math.max(padding, container.clientWidth - panel.offsetWidth - padding)
  const maxTop = Math.max(padding, container.clientHeight - panel.offsetHeight - padding)
  return {
    left: Math.min(Math.max(padding, left), maxLeft),
    top: Math.min(Math.max(padding, top), maxTop),
  }
}

function makeDraggable(panel) {
  return (event) => {
    if (event.target.closest('button')) return
    if (event.button !== 0) return
    const container = panel.closest('.map-panel')
    if (!container) return
    const panelRect = panel.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const grabOffset = {
      x: event.clientX - panelRect.left,
      y: event.clientY - panelRect.top,
    }
    highestPanelZIndex += 1
    panel.style.zIndex = highestPanelZIndex
    panel.classList.add('dragging')
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)

    const move = (moveEvent) => {
      const position = clampPanelPosition(
        panel,
        moveEvent.clientX - containerRect.left - grabOffset.x,
        moveEvent.clientY - containerRect.top - grabOffset.y,
      )
      panel.style.left = `${position.left}px`
      panel.style.top = `${position.top}px`
      panel.style.right = 'auto'
    }
    const end = () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', end)
      panel.classList.remove('dragging')
      const position = clampPanelPosition(panel, panel.offsetLeft, panel.offsetTop)
      panel.style.left = `${position.left}px`
      panel.style.top = `${position.top}px`
      try {
        localStorage.setItem(positionKey(panel), JSON.stringify(position))
      } catch {
        // Vẫn cho phép kéo panel khi trình duyệt chặn localStorage.
      }
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', end)
  }
}

export function formatLength(length) {
  if (length >= 1000) {
    return `${(length / 1000).toFixed(2)} km`
  }

  return `${length.toFixed(1)} m`
}

export function formatArea(area) {
  if (area >= 1000000) {
    return `${(area / 1000000).toFixed(2)} km²`
  }

  return `${area.toFixed(1)} m²`
}
