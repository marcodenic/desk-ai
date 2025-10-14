Issues I would like to fix:

- ✅ I would like to see the actual system responses from commands that are run to be displayed (implemented with toggle in settings)

- ✅ I would like to have some way for users to allow the AI to handle commands that require auth like... sudo commands or something? previously when we had the python back end, I could kind of cheat by entering my password into the sudo request in the python terminal output, but for desktop users who install the app, that wont be an option, so.. how do we address that? can we pop up a request for the user to approve or something? how does it work on windows or mac? (implemented with platform-specific elevation: pkexec on Linux, osascript on macOS, PowerShell UAC on Windows, with approval modal warnings and logging)

- I would like to add a system tray icon that the user can tap to show the app in a smaller pop-up variation of the UX

- I would like to add a keyboard shortcut that shows desktop AI and selects the input so the user can start typing a query immediately. maybe we even have a special, minimal UX that shows up when the user accesses the app via shortcut.