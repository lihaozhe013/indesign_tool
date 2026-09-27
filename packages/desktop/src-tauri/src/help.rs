use std::process::Command;

use tauri::menu::{MenuItemBuilder, MenuItemKind, HELP_SUBMENU_ID};
use tauri::AppHandle;

pub const MANUAL_MENU_ID: &str = "help-user-manual";
pub const MANUAL_URL: &str =
    "https://github.com/lihaozhe013/indesign_tool/blob/main/docs/user-manual.zh-CN.md";

pub fn is_manual_menu_id(id: &str) -> bool {
    id == MANUAL_MENU_ID
}

pub fn attach_menu_item(app: &AppHandle) -> Result<(), String> {
    let help_menu = app
        .menu()
        .and_then(|menu| menu.get(HELP_SUBMENU_ID))
        .and_then(|item| match item {
            MenuItemKind::Submenu(submenu) => Some(submenu),
            _ => None,
        })
        .ok_or_else(|| "The Help menu is unavailable.".to_string())?;
    let manual = MenuItemBuilder::with_id(MANUAL_MENU_ID, "使用手册 / User Manual")
        .build(app)
        .map_err(|error| error.to_string())?;
    help_menu
        .append(&manual)
        .map_err(|error| error.to_string())
}

pub fn open_manual() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("/usr/bin/open")
            .arg(MANUAL_URL)
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("Opening the user manual is supported on macOS only in this release.".into())
    }
}

#[cfg(test)]
mod tests {
    use super::{is_manual_menu_id, MANUAL_MENU_ID, MANUAL_URL};

    #[test]
    fn identifies_the_user_manual_menu_item() {
        assert!(is_manual_menu_id(MANUAL_MENU_ID));
        assert!(!is_manual_menu_id("locale-en"));
    }

    #[test]
    fn links_to_the_versioned_manual_in_the_main_branch() {
        assert_eq!(
            MANUAL_URL,
            "https://github.com/lihaozhe013/indesign_tool/blob/main/docs/user-manual.zh-CN.md"
        );
    }
}
