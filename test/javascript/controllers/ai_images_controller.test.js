/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("lib/image_sources/ai_images", () => ({ AiImageSource: vi.fn() }))
import { Application } from "@hotwired/stimulus"
import AiImagesController from "../../../app/javascript/controllers/image_sources/ai_images_controller.js"
import { AiImageSource } from "lib/image_sources/ai_images"

describe("AiImagesController#generate", () => {
  let application, controller, source

  beforeEach(() => {
    vi.clearAllMocks()
    source = {
      generate: vi.fn().mockResolvedValue({ error: "AI service unavailable" }),
      abort: vi.fn()
    }
    AiImageSource.mockImplementation(() => source)
    document.body.innerHTML = `
      <div data-controller="ai-images">
        <textarea data-ai-images-target="prompt">A landscape</textarea>
        <p class="hidden" data-ai-images-target="error"></p>
      </div>
    `
    application = Application.start()
    application.register("ai-images", AiImagesController)

    return new Promise((resolve) => {
      setTimeout(() => {
        controller = application.getControllerForElementAndIdentifier(
          document.querySelector('[data-controller="ai-images"]'),
          "ai-images"
        )
        controller.source = source
        resolve()
      }, 0)
    })
  })

  afterEach(() => {
    application.stop()
    document.body.replaceChildren()
    vi.restoreAllMocks()
  })

  it("keeps image generation failures inline in the open picker", async () => {
    global.alert = vi.fn()

    await controller.generate()

    expect(source.generate).toHaveBeenCalledWith("A landscape")
    expect(controller.errorTarget.textContent).toBe("AI service unavailable")
    expect(controller.errorTarget.classList.contains("hidden")).toBe(false)
    expect(global.alert).not.toHaveBeenCalled()
  })
})
