import { Controller } from "@hotwired/stimulus"
import { escapeHtml } from "lib/text_utils"
import { EMOJI_DATA } from "lib/emoji_data"
import { ICON_DATA } from "lib/icon_data"
import { setEmojiLocale, getTranslatedEmojis, buildSearchIndex } from "lib/emoji_i18n"

// Emoji Picker Controller
// Handles emoji picker dialog with search and grid navigation
// Supports both Unicode emojis and text emoticons (kaomoji)
// Dispatches emoji-picker:selected event with emoji/emoticon text
// Supports i18n search via emojibase translations

// Emoticon/Kaomoji data: [name, emoticon, keywords for search]
const EMOTICON_DATA = [
  // Happy & Positive
  ["happy", "(◕‿◕)", "smile joy"],
  ["excited", "(ﾉ◕ヮ◕)ﾉ*:・ﾟ✧", "joy sparkle celebrate"],
  ["very_happy", "(✿◠‿◠)", "smile flower cute"],
  ["cute_happy", "(◠‿◠)", "smile simple"],
  ["joyful", "(*^▽^*)", "happy grin"],
  ["grinning", "(＾▽＾)", "smile happy"],
  ["beaming", "(≧◡≦)", "joy bright"],
  ["cheerful", "(｡◕‿◕｡)", "happy cute"],
  ["delighted", "٩(◕‿◕｡)۶", "happy dance"],
  ["sparkling", "(ﾉ´ヮ`)ﾉ*: ・゚✧", "happy magic"],
  ["wink", "(^_~)", "flirt playful"],
  ["winking", "(･ω<)☆", "star playful"],
  ["peace", "(￣▽￣)ノ", "wave hello"],

  // Love & Affection
  ["love", "(♥‿♥)", "heart eyes adore"],
  ["loving", "(´∀`)♡", "heart happy"],
  ["hearts", "(｡♥‿♥｡)", "love adore"],
  ["heart_eyes", "(ღ˘⌣˘ღ)", "love cute"],
  ["blowing_kiss", "(づ￣ ³￣)づ", "kiss love"],
  ["hug", "(つ≧▽≦)つ", "embrace love"],
  ["hugging", "(づ｡◕‿‿◕｡)づ", "embrace cute"],
  ["cuddle", "(っ´▽`)っ", "hug embrace"],
  ["kiss", "(＾3＾)～♡", "love smooch"],
  ["blushing", "(⁄ ⁄•⁄ω⁄•⁄ ⁄)", "shy embarrassed"],

  // Sad & Upset
  ["sad", "(´;ω;`)", "cry tears"],
  ["crying", "(╥﹏╥)", "tears upset"],
  ["tears", "(;_;)", "cry sad"],
  ["weeping", "(っ˘̩╭╮˘̩)っ", "cry hug"],
  ["sobbing", "( ´༎ຶㅂ༎ຶ`)", "cry loud"],
  ["disappointed", "(´･_･`)", "sad down"],
  ["depressed", "(｡•́︿•̀｡)", "sad down"],
  ["hurt", "(｡ŏ﹏ŏ)", "pain sad"],
  ["broken_heart", "(´;︵;`)", "sad love"],
  ["lonely", "(ノ_<。)", "sad alone"],

  // Angry & Frustrated
  ["angry", "(╬ Ò﹏Ó)", "mad rage"],
  ["rage", "(ノಠ益ಠ)ノ彡┻━┻", "flip table mad"],
  ["furious", "(҂`з´)", "angry mad"],
  ["annoyed", "(￣︿￣)", "irritated"],
  ["frustrated", "(ノ°Д°）ノ︵ ┻━┻", "flip table angry"],
  ["table_flip", "(╯°□°)╯︵ ┻━┻", "angry flip rage"],
  ["put_table_back", "┬─┬ノ( º _ ºノ)", "calm restore"],
  ["double_flip", "┻━┻ ︵ヽ(`Д´)ﾉ︵ ┻━┻", "rage flip"],
  ["grumpy", "(¬_¬)", "annoyed side eye"],
  ["pouting", "(´-ε-`)", "sulk annoyed"],

  // Surprised & Shocked
  ["surprised", "(°o°)", "shock wow"],
  ["shocked", "Σ(°△°|||)", "surprise wow"],
  ["amazed", "(⊙_⊙)", "shock stare"],
  ["disbelief", "(」°ロ°)」", "shock arms"],
  ["speechless", "(・□・;)", "shock silent"],
  ["jaw_drop", "( ꒪Д꒪)ノ", "shock surprise"],
  ["gasp", "(゜゜)", "surprise shock"],
  ["startled", "∑(O_O;)", "surprise sudden"],

  // Confused & Thinking
  ["confused", "(・・?)", "puzzled question"],
  ["thinking", "(￢_￢)", "ponder hmm"],
  ["curious", "(◔_◔)", "wondering look"],
  ["puzzled", "(・_・ヾ", "scratch head"],
  ["pondering", "(´-ω-`)", "think hmm"],
  ["unsure", "(；一_一)", "doubt uncertain"],
  ["skeptical", "(¬‿¬)", "doubt suspicious"],
  ["what", "(」゜ロ゜)」", "confused question"],

  // Cute & Kawaii
  ["cat", "(=^・ω・^=)", "neko meow"],
  ["cat_happy", "(=①ω①=)", "neko cute"],
  ["cat_excited", "ฅ(^・ω・^ฅ)", "neko paws"],
  ["cat_sleepy", "(=｀ω´=)", "neko tired"],
  ["bear", "ʕ•ᴥ•ʔ", "animal cute"],
  ["bear_happy", "ʕ￫ᴥ￩ʔ", "animal smile"],
  ["bunny", "(・x・)", "rabbit animal"],
  ["bunny_hop", "⁽⁽◝( •௰• )◜⁾⁾", "rabbit jump"],
  ["dog", "▼・ᴥ・▼", "puppy animal"],
  ["pig", "(´・ω・)ﾉ", "oink animal"],
  ["flower", "(✿´‿`)", "cute happy"],
  ["sparkle", "☆*:.｡.o(≧▽≦)o.｡.:*☆", "star celebrate"],

  // Actions & Gestures
  ["shrug", "¯\\_(ツ)_/¯", "whatever idk"],
  ["look_away", "(눈_눈)", "suspicious stare"],
  ["hide", "|ω・)", "peek shy"],
  ["hiding", "┬┴┬┴┤(･_├┬┴┬┴", "peek wall"],
  ["running", "ε=ε=ε=┌(;*´Д`)ﾉ", "run escape"],
  ["running_away", "ε=ε=ε=ε=┏(;￣▽￣)┛", "escape flee"],
  ["dancing", "♪(´ε` )", "music happy"],
  ["dance_party", "└( ＾ω＾)」", "celebrate music"],
  ["cheering", "ヾ(＾-＾)ノ", "wave celebrate"],
  ["pointing", "(☞ﾟ∀ﾟ)☞", "you there"],
  ["writing", "φ(゜▽゜*)♪", "note pen"],
  ["sleeping", "(－_－) zzZ", "tired sleep"],
  ["yawning", "(´〜｀*) zzz", "tired sleepy"],

  // Fighting & Strong
  ["fighting", "(ง •̀_•́)ง", "fight strong"],
  ["punch", "(ノ•̀ o •́)ノ ~ ┻━┻", "fight angry"],
  ["flexing", "ᕙ(⇀‸↼‶)ᕗ", "strong muscle"],
  ["determined", "(๑•̀ㅂ•́)و✧", "fight ready"],
  ["ready", "(•̀ᴗ•́)و", "determined go"],
  ["victory", "(ง'̀-'́)ง", "win fight"],

  // Eating & Food
  ["eating", "(っ˘ڡ˘ς)", "food yum"],
  ["hungry", "(´ρ`)", "food want"],
  ["delicious", "( ˘▽˘)っ♨", "food yum"],
  ["drooling", "(´﹃｀)", "hungry food"],
  ["cooking", "( ・ω・)o-{{[〃]", "food chef"],

  // Music & Entertainment
  ["singing", "(￣▽￣)/♪♪♪", "music song"],
  ["headphones", "♪(´ε｀ )", "music listening"],
  ["guitar", "♪♪ヽ(ˇ∀ˇ )ゞ", "music play"],
  ["piano", "♬♩♪♩ヽ(・ˇ∀ˇ・ゞ)", "music play"],

  // Weather & Nature
  ["sunny", "☀ヽ(◕ᴗ◕ヽ)", "sun happy"],
  ["rain", "( ´_ゝ`)☂", "umbrella weather"],
  ["snow", "( *・ω・)ノ))(❅)", "cold winter"],
  ["storm", "(;´༎ຶД༎ຶ`)", "rain sad"],

  // Special & Misc
  ["magic", "(ノ°∀°)ノ⌒・*:.。. .。.:*・゜゚・*", "sparkle star"],
  ["wizard", "(∩｀-´)⊃━☆ﾟ.*･｡ﾟ", "magic spell"],
  ["star", "☆(ゝω・)v", "sparkle wink"],
  ["shooting_star", "☆彡", "star wish"],
  ["fireworks", "・*:.｡. ✧ (ó‿ò｡) ✧ .｡.:*・", "celebrate party"],
  ["rainbow", "☆:.｡.o(≧▽≦)o.｡.:*☆", "colorful happy"],
  ["lenny", "( ͡° ͜ʖ ͡°)", "meme suspicious"],
  ["disapproval", "ಠ_ಠ", "stare judge"],
  ["donger", "ヽ༼ຈل͜ຈ༽ﾉ", "meme raise"],
  ["cool", "(⌐■_■)", "sunglasses awesome"],
  ["glasses_off", "( •_•)>⌐■-■", "reveal cool"],
  ["thumbs_up", "(b ᵔ▽ᵔ)b", "approve good"],
  ["ok", "(๑˃ᴗ˂)ﻭ", "good approve"],
  ["applause", "(*´▽`)ノノ", "clap celebrate"],
  ["bow", "m(_ _)m", "thanks sorry respect"],
  ["salute", "(￣^￣)ゞ", "respect yes sir"],
  ["goodbye", "(´・ω・)ノシ", "wave bye"],
  ["hello", "(・ω・)ノ", "wave hi"],
  ["take_my_money", "(╯°□°)╯$ $ $", "money throw"],
  ["zombie", "[¬º-°]¬", "undead walking"],
  ["robot", "{•̃_•̃}", "beep boop"],
  ["alien", "⊂(◉‿◉)つ", "space extraterrestrial"]
]

export default class extends Controller {
  static targets = [
    "dialog",
    "input",
    "grid",
    "preview",
    "tabEmoji",
    "tabEmoticons",
    "tabIcons"
  ]

  static values = {
    columns: { type: Number, default: 10 },
    emoticonColumns: { type: Number, default: 5 },
    iconColumns: { type: Number, default: 8 }
  }

  connect() {
    this.allEmojis = EMOJI_DATA
    this.allEmoticons = EMOTICON_DATA
    this.allIcons = ICON_DATA
    this.filteredItems = [...this.allEmojis]
    this.selectedIndex = 0
    this.activeTab = "emoji" // "emoji", "emoticons", or "icons"
    this.i18nSearchIndex = null // Map of emoji -> translated search terms
    this.i18nLoaded = false

    // Set locale from document
    const locale = document.documentElement.lang || "en"
    setEmojiLocale(locale)

    // Preload i18n data in background
    this.loadI18nData()
  }

  // Load translated emoji data for i18n search
  async loadI18nData() {
    if (this.i18nLoaded) return

    try {
      const data = await getTranslatedEmojis()
      this.i18nSearchIndex = buildSearchIndex(data)
      this.i18nLoaded = true
    } catch (error) {
      console.warn("Failed to load emoji i18n data:", error)
      this.i18nSearchIndex = new Map()
    }
  }

  // Open the emoji picker dialog
  open() {
    this.activeTab = "emoji"
    this.filteredItems = [...this.allEmojis]
    this.selectedIndex = 0

    // Ensure i18n data is loading (non-blocking)
    if (!this.i18nLoaded) {
      this.loadI18nData()
    }

    this.inputTarget.value = ""
    this.updateTabStyles()
    this.renderGrid()
    this.updatePreview()
    this.dialogTarget.showModal()
    this.inputTarget.focus()
  }

  // Close the dialog
  close() {
    this.dialogTarget.close()
  }

  // Switch to emoji tab
  switchToEmoji() {
    if (this.activeTab === "emoji") return
    this.activeTab = "emoji"
    this.selectedIndex = 0
    this.updateTabStyles()
    this.onInput() // Re-apply search filter
  }

  // Switch to emoticons tab
  switchToEmoticons() {
    if (this.activeTab === "emoticons") return
    this.activeTab = "emoticons"
    this.selectedIndex = 0
    this.updateTabStyles()
    this.onInput() // Re-apply search filter
  }

  // Switch to icons tab
  switchToIcons() {
    if (this.activeTab === "icons") return
    this.activeTab = "icons"
    this.selectedIndex = 0
    this.updateTabStyles()
    this.onInput() // Re-apply search filter
  }

  // Handle arrow key navigation on tab buttons
  onTabKeydown(event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return

    event.preventDefault()
    const tabs = ["emoji", "emoticons", "icons"]
    const currentIndex = tabs.indexOf(this.activeTab)

    let newIndex
    if (event.key === "ArrowRight") {
      newIndex = (currentIndex + 1) % tabs.length
    } else {
      newIndex = (currentIndex - 1 + tabs.length) % tabs.length
    }

    this.switchToTab(tabs[newIndex])
    this.tabTarget(tabs[newIndex]).focus()
  }

  // Handle mouse wheel on tab bar to switch tabs
  onTabWheel(event) {
    event.preventDefault()

    const tabs = ["emoji", "emoticons", "icons"]
    const currentIndex = tabs.indexOf(this.activeTab)

    if (event.deltaY > 0 || event.deltaX > 0) {
      // Scroll down/right -> next tab
      this.switchToTab(tabs[(currentIndex + 1) % tabs.length])
    } else {
      // Scroll up/left -> previous tab
      this.switchToTab(tabs[(currentIndex - 1 + tabs.length) % tabs.length])
    }
  }

  // Switch to a tab by name ("emoji", "emoticons", or "icons")
  switchToTab(tab) {
    if (tab === "emoji") this.switchToEmoji()
    else if (tab === "emoticons") this.switchToEmoticons()
    else if (tab === "icons") this.switchToIcons()
  }

  // Get the tab button target element for a tab name
  tabTarget(tab) {
    if (tab === "emoji") return this.tabEmojiTarget
    if (tab === "emoticons") return this.tabEmoticonsTarget
    return this.tabIconsTarget
  }

  // Update tab button styles
  updateTabStyles() {
    const activeClass = "bg-[var(--theme-accent)] text-[var(--theme-accent-text)]"
    const inactiveClass = "hover:bg-[var(--theme-bg-hover)] text-[var(--theme-text-muted)]"

    if (!this.hasTabEmojiTarget || !this.hasTabEmoticonsTarget || !this.hasTabIconsTarget) {
      return
    }

    for (const tab of ["emoji", "emoticons", "icons"]) {
      const target = this.tabTarget(tab)
      const isActive = this.activeTab === tab
      target.className = target.className.replace(activeClass, "").replace(inactiveClass, "").trim()
      target.classList.add(...(isActive ? activeClass : inactiveClass).split(" "))
    }
  }

  // Handle search input
  onInput() {
    const query = this.inputTarget.value.trim().toLowerCase()
    const sourceData = this.getCurrentSourceData()

    if (!query) {
      this.filteredItems = [...sourceData]
    } else if (this.activeTab === "emoji") {
      // Search emojis with i18n support
      this.filteredItems = this.searchEmojisWithI18n(query)
    } else {
      // Search emoticons/icons (English only)
      // Emoticon rows are [name, emoticon, keywords]; icon rows are
      // [name, path, viewBox, keywords] - keywords is always the last item.
      this.filteredItems = sourceData.filter((row) => {
        const keywords = row[row.length - 1]
        const searchText = `${row[0]} ${keywords}`.toLowerCase()
        return query.split(/\s+/).every(term => searchText.includes(term))
      })
    }

    this.selectedIndex = 0
    this.renderGrid()
    this.updatePreview()
  }

  // Get the data array for the currently active tab
  getCurrentSourceData() {
    if (this.activeTab === "emoji") return this.allEmojis
    if (this.activeTab === "emoticons") return this.allEmoticons
    return this.allIcons
  }

  // Search emojis with both English and translated terms
  searchEmojisWithI18n(query) {
    const terms = query.split(/\s+/)

    return this.allEmojis.filter(([shortcode, emoji, keywords]) => {
      // Search in English shortcode and keywords
      const englishText = `${shortcode} ${keywords}`.toLowerCase()
      const matchesEnglish = terms.every(term => englishText.includes(term))
      if (matchesEnglish) return true

      // Search in translated terms if available
      if (this.i18nSearchIndex && this.i18nSearchIndex.has(emoji)) {
        const i18nData = this.i18nSearchIndex.get(emoji)
        return terms.every(term => i18nData.searchTerms.includes(term))
      }

      return false
    })
  }

  // Get current number of columns based on active tab
  getCurrentColumns() {
    if (this.activeTab === "emoji") return this.columnsValue
    if (this.activeTab === "emoticons") return this.emoticonColumnsValue
    return this.iconColumnsValue
  }

  // Render the grid (emoji or emoticon)
  renderGrid() {
    const cols = this.getCurrentColumns()

    if (this.filteredItems.length === 0) {
      this.gridTarget.innerHTML = `
        <div class="col-span-full px-3 py-6 text-center text-[var(--theme-text-muted)] text-sm">
          ${window.t ? window.t("status.no_matches") : "No matches found"}
        </div>
      `
      this.gridTarget.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`
      return
    }

    if (this.activeTab === "emoji") {
      this.renderEmojiGrid()
    } else if (this.activeTab === "emoticons") {
      this.renderEmoticonGrid()
    } else {
      this.renderIconGrid()
    }

    // Update grid columns
    this.gridTarget.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`

    // Scroll selected item into view
    this.scrollSelectedIntoView()
  }

  // Render emoji grid
  renderEmojiGrid() {
    this.gridTarget.innerHTML = this.filteredItems
      .map(([shortcode, emoji], index) => {
        const isSelected = index === this.selectedIndex
        return `
          <button
            type="button"
            class="w-10 h-10 flex items-center justify-center text-2xl rounded hover:bg-[var(--theme-bg-hover)] transition-colors ${
              isSelected ? 'bg-[var(--theme-accent)] ring-2 ring-[var(--theme-accent)] ring-offset-1 ring-offset-[var(--theme-bg-secondary)]' : ''
            }"
            data-index="${index}"
            data-shortcode="${escapeHtml(shortcode)}"
            data-emoji="${escapeHtml(emoji)}"
            data-action="click->emoji-picker#selectFromClick mouseenter->emoji-picker#onHover"
            title=":${escapeHtml(shortcode)}:"
          >${emoji}</button>
        `
      })
      .join("")
  }

  // Render emoticon grid
  renderEmoticonGrid() {
    this.gridTarget.innerHTML = this.filteredItems
      .map(([name, emoticon], index) => {
        const isSelected = index === this.selectedIndex
        return `
          <button
            type="button"
            class="px-2 py-2 flex items-center justify-center text-sm rounded hover:bg-[var(--theme-bg-hover)] transition-colors truncate ${
              isSelected ? 'bg-[var(--theme-accent)] text-[var(--theme-accent-text)] ring-2 ring-[var(--theme-accent)] ring-offset-1 ring-offset-[var(--theme-bg-secondary)]' : 'text-[var(--theme-text-primary)]'
            }"
            data-index="${index}"
            data-name="${escapeHtml(name)}"
            data-emoticon="${escapeHtml(emoticon)}"
            data-action="click->emoji-picker#selectFromClick mouseenter->emoji-picker#onHover"
            title="${escapeHtml(name)}"
          >${escapeHtml(emoticon)}</button>
        `
      })
      .join("")
  }

  // Render icon grid (Phosphor Icons, rendered as inline SVG)
  renderIconGrid() {
    this.gridTarget.innerHTML = this.filteredItems
      .map(([name, path, viewBox], index) => {
        const isSelected = index === this.selectedIndex
        return `
          <button
            type="button"
            class="w-10 h-10 flex items-center justify-center text-lg rounded hover:bg-[var(--theme-bg-hover)] transition-colors ${
              isSelected ? 'bg-[var(--theme-accent)] ring-2 ring-[var(--theme-accent)] ring-offset-1 ring-offset-[var(--theme-bg-secondary)]' : ''
            }"
            data-index="${index}"
            data-name="${escapeHtml(name)}"
            data-action="click->emoji-picker#selectFromClick mouseenter->emoji-picker#onHover"
            title=":ph-${escapeHtml(name)}:"
          ><svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="currentColor" width="1.25em" height="1.25em" aria-hidden="true"><path d="${path}"/></svg></button>
        `
      })
      .join("")
  }

  // Scroll the selected item into view
  scrollSelectedIntoView() {
    const selectedButton = this.gridTarget.querySelector(`[data-index="${this.selectedIndex}"]`)
    if (selectedButton) {
      selectedButton.scrollIntoView({ block: "nearest", behavior: "smooth" })
    }
  }

  // Update the preview area with selected item info
  updatePreview() {
    if (this.filteredItems.length === 0 || !this.hasPreviewTarget) {
      if (this.hasPreviewTarget) {
        this.previewTarget.innerHTML = ""
      }
      return
    }

    const [name, display, viewBox] = this.filteredItems[this.selectedIndex] || []
    if (!name) return

    if (this.activeTab === "emoji") {
      this.previewTarget.innerHTML = `
        <span class="text-4xl">${display}</span>
        <code class="text-sm bg-[var(--theme-bg-tertiary)] px-2 py-1 rounded">:${escapeHtml(name)}:</code>
      `
    } else if (this.activeTab === "icons") {
      this.previewTarget.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="currentColor" width="2em" height="2em" aria-hidden="true"><path d="${display}"/></svg>
        <code class="text-sm bg-[var(--theme-bg-tertiary)] px-2 py-1 rounded">:ph-${escapeHtml(name)}:</code>
      `
    } else {
      this.previewTarget.innerHTML = `
        <span class="text-lg font-mono">${escapeHtml(display)}</span>
        <span class="text-sm text-[var(--theme-text-muted)]">${escapeHtml(name)}</span>
      `
    }
  }

  // Handle keyboard navigation
  onKeydown(event) {
    const cols = this.getCurrentColumns()
    const total = this.filteredItems.length

    if (total === 0) return

    switch (event.key) {
      case "ArrowRight":
        event.preventDefault()
        this.selectedIndex = (this.selectedIndex + 1) % total
        this.renderGrid()
        this.updatePreview()
        break

      case "ArrowLeft":
        event.preventDefault()
        this.selectedIndex = (this.selectedIndex - 1 + total) % total
        this.renderGrid()
        this.updatePreview()
        break

      case "ArrowDown":
        event.preventDefault()
        const nextRow = this.selectedIndex + cols
        if (nextRow < total) {
          this.selectedIndex = nextRow
        } else {
          // Wrap to first row, same column or last item
          const col = this.selectedIndex % cols
          this.selectedIndex = Math.min(col, total - 1)
        }
        this.renderGrid()
        this.updatePreview()
        break

      case "ArrowUp":
        event.preventDefault()
        const prevRow = this.selectedIndex - cols
        if (prevRow >= 0) {
          this.selectedIndex = prevRow
        } else {
          // Wrap to last row, same column or last item
          const col = this.selectedIndex % cols
          const lastRowStart = Math.floor((total - 1) / cols) * cols
          this.selectedIndex = Math.min(lastRowStart + col, total - 1)
        }
        this.renderGrid()
        this.updatePreview()
        break

      // Tab key now works normally (moves focus)

      case "Enter":
        event.preventDefault()
        this.selectCurrent()
        break

      case "Escape":
        // Let dialog handle escape
        break
    }
  }

  // Handle mouse hover on item
  onHover(event) {
    const index = parseInt(event.currentTarget.dataset.index, 10)
    if (!isNaN(index) && index !== this.selectedIndex) {
      this.selectedIndex = index
      this.renderGrid()
      this.updatePreview()
    }
  }

  // Handle click on item
  selectFromClick(event) {
    if (this.activeTab === "emoji") {
      const shortcode = event.currentTarget.dataset.shortcode
      if (shortcode) {
        this.dispatchSelected(`:${shortcode}:`)
      }
    } else if (this.activeTab === "icons") {
      const name = event.currentTarget.dataset.name
      if (name) {
        this.dispatchSelected(`:ph-${name}:`)
      }
    } else {
      const emoticon = event.currentTarget.dataset.emoticon
      if (emoticon) {
        this.dispatchSelected(emoticon)
      }
    }
  }

  // Select current item
  selectCurrent() {
    if (this.filteredItems.length === 0) return

    const [name, display] = this.filteredItems[this.selectedIndex] || []
    if (!name) return

    if (this.activeTab === "emoji") {
      this.dispatchSelected(`:${name}:`)
    } else if (this.activeTab === "icons") {
      this.dispatchSelected(`:ph-${name}:`)
    } else {
      this.dispatchSelected(display)
    }
  }

  // Dispatch selection event and close
  dispatchSelected(text) {
    this.dispatch("selected", {
      detail: { text, type: this.activeTab }
    })
    this.close()
  }
}
