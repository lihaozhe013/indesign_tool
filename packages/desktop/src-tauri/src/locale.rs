use tauri::menu::{CheckMenuItemBuilder, MenuItemKind, PredefinedMenuItem};
use tauri::{AppHandle, Emitter};
use tauri_plugin_store::StoreExt;

const SETTINGS_FILE: &str = "settings.json";
const LOCALE_KEY: &str = "locale";

pub const ENGLISH: &str = "en";
pub const SIMPLIFIED_CHINESE: &str = "zh-Hans";
const SUPPORTED: [&str; 2] = [ENGLISH, SIMPLIFIED_CHINESE];

const VIEW_SUBMENU_TITLE: &str = "View";
const ITEM_ENGLISH: &str = "locale-en";
const ITEM_SIMPLIFIED_CHINESE: &str = "locale-zh-Hans";

/// Emitted after Rust has persisted a locale so the WebView can apply it.
pub const LOCALE_CHANGED_EVENT: &str = "locale-changed";

pub fn is_supported(locale: &str) -> bool {
    SUPPORTED.contains(&locale)
}

pub fn from_menu_id(id: &str) -> Option<&'static str> {
    match id {
        ITEM_ENGLISH => Some(ENGLISH),
        ITEM_SIMPLIFIED_CHINESE => Some(SIMPLIFIED_CHINESE),
        _ => None,
    }
}

/// Returns the stored preference, or `None` on a first run. The caller decides the fallback
/// because only the WebView can observe the system language.
pub fn read(app: &AppHandle) -> Option<String> {
    let store = app.store(SETTINGS_FILE).ok()?;
    store
        .get(LOCALE_KEY)
        .and_then(|value| value.as_str().map(str::to_owned))
        .filter(|locale| is_supported(locale))
}

/// Persists the locale, moves the menu checkmark, and notifies the WebView.
pub fn apply(app: &AppHandle, locale: &str) -> Result<(), String> {
    if !is_supported(locale) {
        return Err(format!("Unsupported locale: {locale}"));
    }
    let store = app
        .store(SETTINGS_FILE)
        .map_err(|error| error.to_string())?;
    store.set(LOCALE_KEY, locale);
    store.save().map_err(|error| error.to_string())?;
    sync_checkmarks(app, locale)?;
    app.emit(LOCALE_CHANGED_EVENT, locale)
        .map_err(|error| error.to_string())
}

/// Adds the language check items to the default View submenu instead of replacing the whole
/// menu bar, so the Edit accelerators the Markdown editor depends on are left intact.
pub fn attach_menu_items(app: &AppHandle) -> Result<(), String> {
    let menu = app
        .menu()
        .ok_or_else(|| "The application menu is unavailable.".to_string())?;
    let view = menu
        .items()
        .map_err(|error| error.to_string())?
        .into_iter()
        .find_map(|item| match item {
            MenuItemKind::Submenu(submenu) => match submenu.text() {
                Ok(title) if title == VIEW_SUBMENU_TITLE => Some(submenu),
                _ => None,
            },
            _ => None,
        })
        .ok_or_else(|| format!("The {VIEW_SUBMENU_TITLE} menu is unavailable."))?;

    let selected = read(app);
    let separator = PredefinedMenuItem::separator(app).map_err(|error| error.to_string())?;
    let english = CheckMenuItemBuilder::with_id(ITEM_ENGLISH, "English")
        .checked(selected.as_deref() == Some(ENGLISH))
        .build(app)
        .map_err(|error| error.to_string())?;
    let simplified_chinese = CheckMenuItemBuilder::with_id(ITEM_SIMPLIFIED_CHINESE, "简体中文")
        .checked(selected.as_deref() == Some(SIMPLIFIED_CHINESE))
        .build(app)
        .map_err(|error| error.to_string())?;

    view.append(&separator)
        .and_then(|()| view.append(&english))
        .and_then(|()| view.append(&simplified_chinese))
        .map_err(|error| error.to_string())
}

fn sync_checkmarks(app: &AppHandle, locale: &str) -> Result<(), String> {
    let menu = app
        .menu()
        .ok_or_else(|| "The application menu is unavailable.".to_string())?;
    for (id, checked) in [
        (ITEM_ENGLISH, locale == ENGLISH),
        (ITEM_SIMPLIFIED_CHINESE, locale == SIMPLIFIED_CHINESE),
    ] {
        if let Some(item) = menu
            .get(id)
            .and_then(|item| item.as_check_menuitem().cloned())
        {
            item.set_checked(checked)
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{from_menu_id, is_supported, ENGLISH, SIMPLIFIED_CHINESE};

    #[test]
    fn accepts_only_the_shipped_locales() {
        assert!(is_supported(ENGLISH));
        assert!(is_supported(SIMPLIFIED_CHINESE));
        assert!(!is_supported("zh-Hant"));
        assert!(!is_supported("ja"));
        assert!(!is_supported(""));
    }

    #[test]
    fn maps_language_menu_ids_onto_locales() {
        assert_eq!(from_menu_id("locale-en"), Some(ENGLISH));
        assert_eq!(from_menu_id("locale-zh-Hans"), Some(SIMPLIFIED_CHINESE));
    }

    #[test]
    fn ignores_unrelated_menu_ids() {
        assert_eq!(from_menu_id("fullscreen"), None);
        assert_eq!(from_menu_id(""), None);
    }
}
