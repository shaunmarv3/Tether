; Tether's branded install / uninstall wizard (Stage colours). electron-builder picks this file up from resources/
; and includes it above its own pages; the side and header art are resources/*Sidebar.bmp + installerHeader.bmp
; (drawn by scripts/make-icons.mjs).

; Welcome / finish pages and the page header: cream with oxblood ink, like Tether's dialogs.
!define MUI_BGCOLOR F6E9DA
!define MUI_TEXTCOLOR 24100A

!ifndef BUILD_UNINSTALLER
  !define MUI_FINISHPAGE_TITLE "Tether is installed"
  !define MUI_FINISHPAGE_TEXT "Plug in your phone with a USB cable and open Tether. The first start walks you through the rest."
!else
  !define MUI_FINISHPAGE_TITLE "Tether is removed"
  !define MUI_FINISHPAGE_TEXT "Your phone stays as it is. Thanks for using Tether."
!endif

; Always for this user only, no admin rights: skip the "only for me / anyone" page (installer and uninstaller).
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to Tether"
  !define MUI_WELCOMEPAGE_TEXT "Your Android phone, on this PC.$\r$\n$\r$\nTether installs for you only, so it needs no admin rights, and nothing gets installed on your phone.$\r$\n$\r$\nClick Next to install."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Uninstall Tether"
  !define MUI_WELCOMEPAGE_TEXT "Tether will be removed from this PC.$\r$\n$\r$\nYour phone stays as it is. Your password, trusted phones and saved files stay too, in case you install Tether again.$\r$\n$\r$\nClick Next to uninstall."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend
