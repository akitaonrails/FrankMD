import { Controller } from "@hotwired/stimulus"
import { parseMarkdownTable, generateMarkdownTable } from "lib/table_utils"
import { escapeHtml } from "lib/text_utils"

// Table Editor Controller
// Manages the table editing dialog and generates markdown tables
export default class extends Controller {
  static targets = [
    "dialog",
    "grid",
    "columnCountInput",
    "rowCountInput",
    "cellMenu",
    "moveColLeftBtn",
    "moveColRightBtn",
    "deleteColBtn",
    "moveRowUpBtn",
    "moveRowDownBtn",
    "deleteRowBtn"
  ]

  connect() {
    this.tableData = []
    this.editMode = false
    this.startPos = 0
    this.endPos = 0
    this.selectedCellRow = 0
    this.selectedCellCol = 0

    // Store bound handler for proper cleanup
    this.boundHandleOpen = this.handleOpen.bind(this)
    window.addEventListener("frankmd:open-table-editor", this.boundHandleOpen)
  }

  disconnect() {
    window.removeEventListener("frankmd:open-table-editor", this.boundHandleOpen)
  }

  handleOpen(event) {
    const { existingTable, startPos, endPos } = event.detail || {}

    if (existingTable) {
      this.editMode = true
      this.startPos = startPos
      this.endPos = endPos
      this.tableData = parseMarkdownTable(existingTable)

      if (this.tableData.length === 0) {
        this.tableData = [[window.t("dialogs.table_editor.header_n", { n: 1 }), window.t("dialogs.table_editor.header_n", { n: 2 }), window.t("dialogs.table_editor.header_n", { n: 3 })]]
      }
    } else {
      this.editMode = false
      this.tableData = [
        [window.t("dialogs.table_editor.header_n", { n: 1 }), window.t("dialogs.table_editor.header_n", { n: 2 }), window.t("dialogs.table_editor.header_n", { n: 3 })],
        ["", "", ""],
        ["", "", ""]
      ]
    }

    this.renderGrid()
    this.dialogTarget.showModal()
    this.dialogTarget.focus({ preventScroll: true })
  }

  close() {
    this.dialogTarget.close()
  }

  // Use imported utility functions
  // parseMarkdownTable and generateMarkdownTable are now imported from lib/table_utils

  getMarkdownOutput() {
    return generateMarkdownTable(this.tableData)
  }

  renderGrid() {
    const rows = this.tableData.length
    const cols = this.tableData[0]?.length || 3
    this.syncDimensionInputs(rows, cols)

    let html = '<table class="table-editor-grid w-full">'

    for (let r = 0; r < rows; r++) {
      html += '<tr>'
      for (let c = 0; c < cols; c++) {
        const value = this.tableData[r]?.[c] || ""
        const isHeader = r === 0
        const cellClass = isHeader ? "font-semibold bg-[var(--theme-bg-tertiary)]" : ""
        html += `
          <td class="${cellClass}" data-row="${r}" data-col="${c}" data-action="contextmenu->table-editor#showCellMenu">
            <input
              type="text"
              value="${escapeHtml(value)}"
              data-row="${r}"
              data-col="${c}"
              data-action="input->table-editor#onCellInput contextmenu->table-editor#showCellMenu"
              class="w-full px-2 py-1 text-sm bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-[var(--theme-accent)] text-[var(--theme-text-primary)]"
              placeholder="${isHeader ? window.t("dialogs.table_editor.header") : ''}"
            >
          </td>
        `
      }
      html += '</tr>'
    }

    html += '</table>'
    this.gridTarget.innerHTML = html
  }

  onCellInput(event) {
    const row = parseInt(event.target.dataset.row)
    const col = parseInt(event.target.dataset.col)
    const value = event.target.value

    while (this.tableData.length <= row) {
      this.tableData.push([])
    }
    while (this.tableData[row].length <= col) {
      this.tableData[row].push("")
    }

    this.tableData[row][col] = value
  }

  parseCount(value, fallback) {
    const parsed = parseInt(value, 10)
    if (Number.isNaN(parsed)) return fallback
    return Math.max(1, parsed)
  }

  syncDimensionInputs(rows = this.tableData.length, cols = this.tableData[0]?.length || 1) {
    if (this.hasColumnCountInputTarget) {
      this.columnCountInputTarget.value = cols
    }
    if (this.hasRowCountInputTarget) {
      this.rowCountInputTarget.value = rows
    }
  }

  setColumnCount(event) {
    const fallback = this.tableData[0]?.length || 1
    const nextCount = this.parseCount(event.target.value, fallback)
    this.setColumnCountTo(nextCount)
  }

  incrementColumnCount() {
    const cols = this.tableData[0]?.length || 1
    this.setColumnCountTo(cols + 1)
  }

  decrementColumnCount() {
    const cols = this.tableData[0]?.length || 1
    this.setColumnCountTo(cols - 1)
  }

  setColumnCountTo(count) {
    if (this.tableData.length === 0) {
      this.tableData = [[window.t("dialogs.table_editor.header_n", { n: 1 })]]
    }

    const currentCols = this.tableData[0]?.length || 1
    const nextCols = Math.max(1, Math.floor(count))

    if (nextCols === currentCols) {
      this.syncDimensionInputs(this.tableData.length, currentCols)
      return
    }

    for (let r = 0; r < this.tableData.length; r++) {
      if (nextCols > this.tableData[r].length) {
        for (let c = this.tableData[r].length; c < nextCols; c++) {
          this.tableData[r].push(r === 0 ? window.t("dialogs.table_editor.header_n", { n: c + 1 }) : "")
        }
      } else {
        this.tableData[r] = this.tableData[r].slice(0, nextCols)
      }
    }

    this.renderGrid()
  }

  setRowCount(event) {
    const fallback = this.tableData.length || 1
    const nextCount = this.parseCount(event.target.value, fallback)
    this.setRowCountTo(nextCount)
  }

  incrementRowCount() {
    this.setRowCountTo(this.tableData.length + 1)
  }

  decrementRowCount() {
    this.setRowCountTo(this.tableData.length - 1)
  }

  setRowCountTo(count) {
    if (this.tableData.length === 0) {
      this.tableData = [[window.t("dialogs.table_editor.header_n", { n: 1 })]]
    }

    const currentRows = this.tableData.length
    const nextRows = Math.max(1, Math.floor(count))
    const cols = this.tableData[0]?.length || 1

    if (nextRows === currentRows) {
      this.syncDimensionInputs(currentRows, cols)
      return
    }

    if (nextRows > currentRows) {
      for (let r = currentRows; r < nextRows; r++) {
        this.tableData.push(new Array(cols).fill(""))
      }
    } else {
      this.tableData = this.tableData.slice(0, nextRows)
    }

    this.renderGrid()
  }

  addColumn() {
    this.incrementColumnCount()
  }

  removeColumn() {
    this.decrementColumnCount()
  }

  addRow() {
    this.incrementRowCount()
  }

  removeRow() {
    this.decrementRowCount()
  }

  insert() {
    if (!this.tableData || this.tableData.length === 0) {
      this.close()
      return
    }

    const markdown = this.getMarkdownOutput()

    // Dispatch event for app controller to handle insertion
    window.dispatchEvent(new CustomEvent("frankmd:insert-table", {
      detail: {
        markdown,
        editMode: this.editMode,
        startPos: this.startPos,
        endPos: this.endPos
      }
    }))

    this.close()
  }

  // Cell Context Menu
  showCellMenu(event) {
    event.preventDefault()
    event.stopPropagation()

    let target = event.target
    if (target.tagName === "INPUT") {
      target = target.closest("td")
    }

    this.selectedCellRow = parseInt(target.dataset.row)
    this.selectedCellCol = parseInt(target.dataset.col)

    const rows = this.tableData.length
    const cols = this.tableData[0]?.length || 0

    // Enable/disable buttons based on position
    this.moveColLeftBtnTarget.classList.toggle("opacity-50", this.selectedCellCol === 0)
    this.moveColLeftBtnTarget.disabled = this.selectedCellCol === 0

    this.moveColRightBtnTarget.classList.toggle("opacity-50", this.selectedCellCol >= cols - 1)
    this.moveColRightBtnTarget.disabled = this.selectedCellCol >= cols - 1

    this.deleteColBtnTarget.classList.toggle("opacity-50", cols <= 1)
    this.deleteColBtnTarget.disabled = cols <= 1

    this.moveRowUpBtnTarget.classList.toggle("opacity-50", this.selectedCellRow <= 1)
    this.moveRowUpBtnTarget.disabled = this.selectedCellRow <= 1

    this.moveRowDownBtnTarget.classList.toggle("opacity-50", this.selectedCellRow === 0 || this.selectedCellRow >= rows - 1)
    this.moveRowDownBtnTarget.disabled = this.selectedCellRow === 0 || this.selectedCellRow >= rows - 1

    this.deleteRowBtnTarget.classList.toggle("opacity-50", rows <= 1 || this.selectedCellRow === 0)
    this.deleteRowBtnTarget.disabled = rows <= 1 || this.selectedCellRow === 0

    const menu = this.cellMenuTarget
    menu.classList.remove("hidden")
    menu.style.left = `${event.clientX}px`
    menu.style.top = `${event.clientY}px`

    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect()
      if (rect.right > window.innerWidth) {
        menu.style.left = `${window.innerWidth - rect.width - 10}px`
      }
      if (rect.bottom > window.innerHeight) {
        menu.style.top = `${window.innerHeight - rect.height - 10}px`
      }
    })

    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.classList.add("hidden")
        document.removeEventListener("click", closeMenu)
      }
    }
    setTimeout(() => document.addEventListener("click", closeMenu), 0)
  }

  hideCellMenu() {
    this.cellMenuTarget.classList.add("hidden")
  }

  moveColumnLeft() {
    this.hideCellMenu()
    const col = this.selectedCellCol
    if (col <= 0) return

    for (let r = 0; r < this.tableData.length; r++) {
      const temp = this.tableData[r][col]
      this.tableData[r][col] = this.tableData[r][col - 1]
      this.tableData[r][col - 1] = temp
    }

    this.selectedCellCol = col - 1
    this.renderGrid()
  }

  moveColumnRight() {
    this.hideCellMenu()
    const col = this.selectedCellCol
    const cols = this.tableData[0]?.length || 0
    if (col >= cols - 1) return

    for (let r = 0; r < this.tableData.length; r++) {
      const temp = this.tableData[r][col]
      this.tableData[r][col] = this.tableData[r][col + 1]
      this.tableData[r][col + 1] = temp
    }

    this.selectedCellCol = col + 1
    this.renderGrid()
  }

  deleteColumnAt() {
    this.hideCellMenu()
    const cols = this.tableData[0]?.length || 0
    if (cols <= 1) return

    const col = this.selectedCellCol
    for (let r = 0; r < this.tableData.length; r++) {
      this.tableData[r].splice(col, 1)
    }

    this.renderGrid()
  }

  moveRowUp() {
    this.hideCellMenu()
    const row = this.selectedCellRow
    if (row <= 1) return

    const temp = this.tableData[row]
    this.tableData[row] = this.tableData[row - 1]
    this.tableData[row - 1] = temp

    this.selectedCellRow = row - 1
    this.renderGrid()
  }

  moveRowDown() {
    this.hideCellMenu()
    const row = this.selectedCellRow
    const rows = this.tableData.length
    if (row === 0 || row >= rows - 1) return

    const temp = this.tableData[row]
    this.tableData[row] = this.tableData[row + 1]
    this.tableData[row + 1] = temp

    this.selectedCellRow = row + 1
    this.renderGrid()
  }

  deleteRowAt() {
    this.hideCellMenu()
    const rows = this.tableData.length
    const row = this.selectedCellRow
    if (rows <= 1 || row === 0) return

    this.tableData.splice(row, 1)
    this.renderGrid()
  }
}
