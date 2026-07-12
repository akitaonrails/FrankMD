// Import and register all your controllers from the importmap via controllers/**/*_controller
import { application } from "controllers/application"
import { lazyLoadControllersFrom } from "@hotwired/stimulus-loading"

// Manually register locale controller (needs to load early for translations)
import LocaleController from "controllers/locale_controller"
application.register("locale", LocaleController)

// Manually register image source controllers with simpler names
// (subdirectory controllers would otherwise be registered as "image-sources--local-images")
import LocalImagesController from "controllers/image_sources/local_images_controller"
import FolderImagesController from "controllers/image_sources/folder_images_controller"
import DropImagesController from "controllers/image_sources/drop_images_controller"
import WebImagesController from "controllers/image_sources/web_images_controller"
import GoogleImagesController from "controllers/image_sources/google_images_controller"
import PinterestImagesController from "controllers/image_sources/pinterest_images_controller"
import AiImagesController from "controllers/image_sources/ai_images_controller"

application.register("local-images", LocalImagesController)
application.register("folder-images", FolderImagesController)
application.register("drop-images", DropImagesController)
application.register("web-images", WebImagesController)
application.register("google-images", GoogleImagesController)
application.register("pinterest-images", PinterestImagesController)
application.register("ai-images", AiImagesController)

// Lazy load remaining controllers on-demand when their DOM elements appear
lazyLoadControllersFrom("controllers", application)
