import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { Application } from "@hotwired/stimulus"
import { setupJsdomGlobals } from "../helpers/jsdom_globals.js"
import TableEditorController from "../../../app/javascript/controllers/table_editor_controller.js"

// Stub window.t for translation lookups
function stubTranslations() {
  window.t = (key, options = {}) => {
    if (key === "dialogs.table_editor.header_n") return `Header ${options.n}`
    if (key === "dialogs.table_editor.header") return "Header"
    return key
  }
}

// Minimal HTML structure matching _table_editor.html.erb
function tableEditorHTML() {
  return `
    <div data-controller="table-editor">
      <dialog data-table-editor-target="dialog" tabindex="-1">
        <div data-table-editor-target="grid"></div>
        <input type="number" data-table-editor-target="columnCountInput" value="3">
        <input type="number" data-table-editor-target="rowCountInput" value="3">
        <div class="hidden" data-table-editor-target="cellMenu"></div>
        <button data-table-editor-target="moveColLeftBtn"></button>
        <button data-table-editor-target="moveColRightBtn"></button>
        <button data-table-editor-target="deleteColBtn"></button>
        <button data-table-editor-target="moveRowUpBtn"></button>
        <button data-table-editor-target="moveRowDownBtn"></button>
        <button data-table-editor-target="deleteRowBtn"></button>
      </dialog>
    </div>
  `
}

describe("TableEditorController", () => {
  let application
  let controller

  beforeEach(() => {
    setupJsdomGlobals()
    stubTranslations()

    // JSDOM doesn't implement showModal/close natively
    if (!global.HTMLDialogElement) global.HTMLDialogElement = global.HTMLElement
    global.HTMLDialogElement.prototype.showModal = global.HTMLDialogElement.prototype.showModal || function() { this.open = true }
    global.HTMLDialogElement.prototype.close = global.HTMLDialogElement.prototype.close || function() { this.open = false }

    document.body.innerHTML = tableEditorHTML()

    application = Application.start()
    application.register("table-editor", TableEditorController)

    return new Promise((resolve) => {
      setTimeout(() => {
        controller = application.getControllerForElementAndIdentifier(
          document.querySelector("[data-controller='table-editor']"), "table-editor"
        )
        resolve()
      }, 0)
    })
  })

  afterEach(() => {
    application.stop()
    vi.restoreAllMocks()
  })

  // === parseCount ===

  describe("parseCount()", () => {
    it("parses valid integer strings", () => {
      expect(controller.parseCount("5", 1)).toBe(5)
    })

    it("clamps to minimum of 1", () => {
      expect(controller.parseCount("0", 3)).toBe(1)
      expect(controller.parseCount("-5", 3)).toBe(1)
    })

    it("returns fallback for NaN", () => {
      expect(controller.parseCount("abc", 7)).toBe(7)
      expect(controller.parseCount("", 4)).toBe(4)
    })

    it("truncates float strings to integer", () => {
      expect(controller.parseCount("3.9", 1)).toBe(3)
    })
  })

  // === syncDimensionInputs ===

  describe("syncDimensionInputs()", () => {
    it("updates input values to match table data", () => {
      controller.tableData = [["A", "B"], ["1", "2"], ["3", "4"]]
      controller.syncDimensionInputs()

      expect(controller.columnCountInputTarget.value).toBe("2")
      expect(controller.rowCountInputTarget.value).toBe("3")
    })

    it("accepts explicit values", () => {
      controller.syncDimensionInputs(5, 10)

      expect(controller.rowCountInputTarget.value).toBe("5")
      expect(controller.columnCountInputTarget.value).toBe("10")
    })
  })

  // === Column Count ===

  describe("setColumnCountTo()", () => {
    beforeEach(() => {
      controller.tableData = [
        ["Header 1", "Header 2", "Header 3"],
        ["a", "b", "c"],
        ["d", "e", "f"]
      ]
    })

    it("adds columns when increasing count", () => {
      controller.setColumnCountTo(5)

      expect(controller.tableData[0].length).toBe(5)
      expect(controller.tableData[0][3]).toBe("Header 4")
      expect(controller.tableData[0][4]).toBe("Header 5")
      // Non-header rows get empty strings
      expect(controller.tableData[1][3]).toBe("")
      expect(controller.tableData[1][4]).toBe("")
    })

    it("removes columns when decreasing count", () => {
      controller.setColumnCountTo(1)

      expect(controller.tableData[0]).toEqual(["Header 1"])
      expect(controller.tableData[1]).toEqual(["a"])
      expect(controller.tableData[2]).toEqual(["d"])
    })

    it("enforces minimum of 1 column", () => {
      controller.setColumnCountTo(0)
      expect(controller.tableData[0].length).toBe(1)

      controller.setColumnCountTo(-5)
      expect(controller.tableData[0].length).toBe(1)
    })

    it("no-ops when count is same as current", () => {
      const renderSpy = vi.spyOn(controller, "renderGrid")
      controller.setColumnCountTo(3)
      expect(renderSpy).not.toHaveBeenCalled()
    })

    it("creates initial row if tableData is empty", () => {
      controller.tableData = []
      controller.setColumnCountTo(3)

      expect(controller.tableData.length).toBeGreaterThanOrEqual(1)
      expect(controller.tableData[0].length).toBe(3)
    })

    it("floors fractional counts", () => {
      controller.setColumnCountTo(2.9)
      expect(controller.tableData[0].length).toBe(2)
    })
  })

  describe("incrementColumnCount()", () => {
    it("adds one column", () => {
      controller.tableData = [["A", "B"], ["1", "2"]]
      controller.incrementColumnCount()
      expect(controller.tableData[0].length).toBe(3)
    })
  })

  describe("decrementColumnCount()", () => {
    it("removes one column", () => {
      controller.tableData = [["A", "B", "C"], ["1", "2", "3"]]
      controller.decrementColumnCount()
      expect(controller.tableData[0].length).toBe(2)
    })

    it("does not go below 1 column", () => {
      controller.tableData = [["A"], ["1"]]
      controller.decrementColumnCount()
      expect(controller.tableData[0].length).toBe(1)
    })
  })

  // === Row Count ===

  describe("setRowCountTo()", () => {
    beforeEach(() => {
      controller.tableData = [
        ["Header 1", "Header 2"],
        ["a", "b"],
        ["c", "d"]
      ]
    })

    it("adds rows when increasing count", () => {
      controller.setRowCountTo(5)

      expect(controller.tableData.length).toBe(5)
      expect(controller.tableData[3]).toEqual(["", ""])
      expect(controller.tableData[4]).toEqual(["", ""])
    })

    it("removes rows when decreasing count", () => {
      controller.setRowCountTo(1)

      expect(controller.tableData.length).toBe(1)
      expect(controller.tableData[0]).toEqual(["Header 1", "Header 2"])
    })

    it("enforces minimum of 1 row", () => {
      controller.setRowCountTo(0)
      expect(controller.tableData.length).toBe(1)

      controller.setRowCountTo(-3)
      expect(controller.tableData.length).toBe(1)
    })

    it("no-ops when count is same as current", () => {
      const renderSpy = vi.spyOn(controller, "renderGrid")
      controller.setRowCountTo(3)
      expect(renderSpy).not.toHaveBeenCalled()
    })

    it("creates initial row if tableData is empty", () => {
      controller.tableData = []
      controller.setRowCountTo(3)

      expect(controller.tableData.length).toBe(3)
    })

    it("new rows match existing column count", () => {
      controller.setRowCountTo(5)
      expect(controller.tableData[4].length).toBe(2)
    })
  })

  describe("incrementRowCount()", () => {
    it("adds one row", () => {
      controller.tableData = [["A"], ["1"]]
      controller.incrementRowCount()
      expect(controller.tableData.length).toBe(3)
      expect(controller.tableData[2]).toEqual([""])
    })
  })

  describe("decrementRowCount()", () => {
    it("removes one row", () => {
      controller.tableData = [["A"], ["1"], ["2"]]
      controller.decrementRowCount()
      expect(controller.tableData.length).toBe(2)
    })

    it("does not go below 1 row", () => {
      controller.tableData = [["A"]]
      controller.decrementRowCount()
      expect(controller.tableData.length).toBe(1)
    })
  })

  // === Legacy add/remove delegate to new methods ===

  describe("legacy add/remove methods", () => {
    it("addColumn delegates to incrementColumnCount", () => {
      const spy = vi.spyOn(controller, "incrementColumnCount")
      controller.addColumn()
      expect(spy).toHaveBeenCalled()
    })

    it("removeColumn delegates to decrementColumnCount", () => {
      const spy = vi.spyOn(controller, "decrementColumnCount")
      controller.removeColumn()
      expect(spy).toHaveBeenCalled()
    })

    it("addRow delegates to incrementRowCount", () => {
      const spy = vi.spyOn(controller, "incrementRowCount")
      controller.addRow()
      expect(spy).toHaveBeenCalled()
    })

    it("removeRow delegates to decrementRowCount", () => {
      const spy = vi.spyOn(controller, "decrementRowCount")
      controller.removeRow()
      expect(spy).toHaveBeenCalled()
    })
  })

  // === setColumnCount / setRowCount (event handlers) ===

  describe("setColumnCount(event)", () => {
    it("reads value from event target and applies", () => {
      controller.tableData = [["A", "B"], ["1", "2"]]
      controller.setColumnCount({ target: { value: "4" } })
      expect(controller.tableData[0].length).toBe(4)
    })

    it("uses fallback on invalid input", () => {
      controller.tableData = [["A", "B"], ["1", "2"]]
      controller.setColumnCount({ target: { value: "xyz" } })
      expect(controller.tableData[0].length).toBe(2)
    })
  })

  describe("setRowCount(event)", () => {
    it("reads value from event target and applies", () => {
      controller.tableData = [["A"], ["1"]]
      controller.setRowCount({ target: { value: "4" } })
      expect(controller.tableData.length).toBe(4)
    })

    it("uses fallback on invalid input", () => {
      controller.tableData = [["A"], ["1"], ["2"]]
      controller.setRowCount({ target: { value: "" } })
      expect(controller.tableData.length).toBe(3)
    })
  })

  // === renderGrid updates inputs ===

  describe("renderGrid()", () => {
    it("syncs dimension inputs after rendering", () => {
      controller.tableData = [["A", "B"], ["1", "2"]]
      controller.renderGrid()

      expect(controller.columnCountInputTarget.value).toBe("2")
      expect(controller.rowCountInputTarget.value).toBe("2")
    })

    it("renders correct number of rows and cells", () => {
      controller.tableData = [["A", "B", "C"], ["1", "2", "3"]]
      controller.renderGrid()

      const rows = controller.gridTarget.querySelectorAll("tr")
      expect(rows.length).toBe(2)
      expect(rows[0].querySelectorAll("td").length).toBe(3)
    })

    it("renders header row with font-semibold class", () => {
      controller.tableData = [["H1", "H2"], ["a", "b"]]
      controller.renderGrid()

      const firstCell = controller.gridTarget.querySelector("td")
      expect(firstCell.className).toContain("font-semibold")
    })

    it("does not allow a quoted cell value to inject attributes", () => {
      controller.tableData = [['photo" onerror="alert(1)']]
      controller.renderGrid()

      expect(controller.gridTarget.querySelector("input").hasAttribute("onerror")).toBe(false)
    })
  })

  // === handleOpen ===

  describe("handleOpen()", () => {
    it("initializes 3x3 default table for new table", () => {
      controller.handleOpen({ detail: {} })

      expect(controller.tableData.length).toBe(3)
      expect(controller.tableData[0].length).toBe(3)
      expect(controller.editMode).toBe(false)
    })

    it("parses existing table in edit mode", () => {
      const existing = "| A | B |\n| --- | --- |\n| 1 | 2 |"
      controller.handleOpen({
        detail: { existingTable: existing, startPos: 10, endPos: 50 }
      })

      expect(controller.editMode).toBe(true)
      expect(controller.startPos).toBe(10)
      expect(controller.endPos).toBe(50)
      expect(controller.tableData).toEqual([["A", "B"], ["1", "2"]])
    })
  })

  // === insert dispatches event ===

  describe("insert()", () => {
    it("dispatches frankmd:insert-table event with markdown", () => {
      controller.tableData = [["A", "B"], ["1", "2"]]
      controller.editMode = false

      const spy = vi.fn()
      window.addEventListener("frankmd:insert-table", spy)

      controller.insert()

      expect(spy).toHaveBeenCalled()
      const detail = spy.mock.calls[0][0].detail
      expect(detail.markdown).toContain("| A")
      expect(detail.editMode).toBe(false)
    })

    it("closes dialog without dispatching when tableData is empty", () => {
      controller.tableData = []
      const spy = vi.fn()
      window.addEventListener("frankmd:insert-table", spy)

      controller.insert()

      expect(spy).not.toHaveBeenCalled()
    })
  })
})
