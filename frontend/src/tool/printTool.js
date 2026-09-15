import { createToolPanel } from './toolUtils.js'

export function createPrintTool() {
  const panel = createToolPanel({ id: 'print-panel', title: 'In bản đồ', content: '<label>Khổ giấy<select><option>A4 ngang</option><option>A4 dọc</option></select></label><button data-print="true">Mở hộp thoại in</button><p class="tool-hint">Giai đoạn 2 in khung bản đồ hiện tại. Xuất PDF chuyên dụng sẽ được bổ sung khi hoàn thiện dữ liệu.</p>' })
  panel.querySelector('[data-print]').addEventListener('click', () => window.print())
  return { open: () => panel.classList.add('shown'), close: () => panel.classList.remove('shown') }
}
