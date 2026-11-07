; Adds 3FM to Explorer's "Open with" for STL, 3MF and G-code files. It does not
; make 3FM the default program: files keep opening where they did before, and
; Windows offers 3FM when the user picks "Open with".

!macro customInstall
  WriteRegStr SHELL_CONTEXT "Software\Classes\3FM.Model" "" "3D printing file"
  WriteRegStr SHELL_CONTEXT "Software\Classes\3FM.Model\DefaultIcon" "" "$appExe,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\3FM.Model\shell\open" "" "Open with 3FM"
  WriteRegStr SHELL_CONTEXT "Software\Classes\3FM.Model\shell\open\command" "" '"$appExe" "%1"'

  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\3FM.exe" "FriendlyAppName" "3FM"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\3FM.exe\shell\open\command" "" '"$appExe" "%1"'

  !insertmacro 3FM_OFFER stl
  !insertmacro 3FM_OFFER 3mf
  !insertmacro 3FM_OFFER gcode

  ; Tell Explorer the choices changed.
  System::Call "shell32::SHChangeNotify(i 0x08000000, i 0x1000, p 0, p 0)"
!macroend

!macro 3FM_OFFER EXT
  WriteRegNone SHELL_CONTEXT "Software\Classes\.${EXT}\OpenWithProgids" "3FM.Model"
  WriteRegStr SHELL_CONTEXT "Software\Classes\Applications\3FM.exe\SupportedTypes" ".${EXT}" ""
!macroend

!macro customUnInstall
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.stl\OpenWithProgids" "3FM.Model"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.3mf\OpenWithProgids" "3FM.Model"
  DeleteRegValue SHELL_CONTEXT "Software\Classes\.gcode\OpenWithProgids" "3FM.Model"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\3FM.Model"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Applications\3FM.exe"
  System::Call "shell32::SHChangeNotify(i 0x08000000, i 0x1000, p 0, p 0)"
!macroend
