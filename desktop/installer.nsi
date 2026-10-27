Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"

!ifndef PAYLOAD
  !error "Provide /DPAYLOAD=<folder built by DGCLIPS-folder.spec>"
!endif
!ifndef OUTPUT
  !error "Provide /DOUTPUT=<absolute installer path>"
!endif
Name "DGCLIPS Studio"
OutFile "${OUTPUT}"
InstallDir "$LOCALAPPDATA\DGCLIPS Studio"
RequestExecutionLevel user
; Compress files separately: the bundled voice model makes the raw tree exceed 2 GiB.
SetCompressor lzma
SetCompressorDictSize 32
; Avoid mapping the complete multi-GB runtime for deduplication in 32-bit makensis.
SetDatablockOptimize off
CRCCheck force
BrandingText "DGCLIPS Studio · Menos edição. Mais criação."
VIProductVersion "1.2.0.0"
VIAddVersionKey "ProductName" "DGCLIPS Studio"
VIAddVersionKey "FileDescription" "Instalador do DGCLIPS Studio para Windows"
VIAddVersionKey "FileVersion" "1.2.0"
VIAddVersionKey "LegalCopyright" "DGCLIPS contributors · AGPL-3.0"
Icon "DGCLIPS.ico"
UninstallIcon "DGCLIPS.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\DGCLIPS.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o DGCLIPS Studio"
!define MUI_WELCOMEPAGE_TITLE "Seu estúdio. No seu computador."
!define MUI_WELCOMEPAGE_TEXT "O DGCLIPS inclui transcrição, 9 estilos de legenda e layouts para react.$\r$\n$\r$\nNa primeira análise, o programa baixa sua IA de seleção de momentos (2,5 GB). Depois, vídeos locais funcionam sem internet.$\r$\n$\r$\nEscolha o disco D: na próxima tela. Não precisa de Docker, Python, Node, cadastro ou chaves de API."
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "PortugueseBR"

Function .onInit
  IfFileExists "D:\*.*" 0 +2
    StrCpy $INSTDIR "D:\DGCLIPS Studio"
  FindWindow $0 "" "DGCLIPS Studio"
  ${If} $0 != 0
    MessageBox MB_OK "Feche o DGCLIPS antes de instalar ou atualizar. Espere os vídeos em processamento terminarem."
    Abort
  ${EndIf}
FunctionEnd

Section "DGCLIPS Studio"
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File /r /x "DGCLIPS-Dados" /x "model.bin" "${PAYLOAD}\*.*"
  ; FP16 weights compress poorly. Store them directly to keep build/install times reasonable.
  SetOutPath "$INSTDIR\_internal\models\whisper-turbo"
  SetCompress off
  File "${PAYLOAD}\_internal\models\whisper-turbo\model.bin"
  SetCompress auto
  SetOutPath "$INSTDIR"
  WriteUninstaller "$INSTDIR\Desinstalar DGCLIPS.exe"
  CreateShortcut "$DESKTOP\DGCLIPS Studio.lnk" "$INSTDIR\DGCLIPS.exe"
  CreateShortcut "$SMPROGRAMS\DGCLIPS Studio.lnk" "$INSTDIR\DGCLIPS.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DGCLIPS-Desktop" "DisplayName" "DGCLIPS Studio"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DGCLIPS-Desktop" "DisplayVersion" "1.2.0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DGCLIPS-Desktop" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DGCLIPS-Desktop" "DisplayIcon" "$INSTDIR\DGCLIPS.exe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DGCLIPS-Desktop" "UninstallString" '$\"$INSTDIR\Desinstalar DGCLIPS.exe$\"'
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DGCLIPS-Desktop" "NoModify" 1
  WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DGCLIPS-Desktop" "NoRepair" 1
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  FindWindow $0 "" "DGCLIPS Studio"
  ${If} $0 != 0
    MessageBox MB_OK "Feche o DGCLIPS antes de desinstalar."
    Abort
  ${EndIf}
  Delete "$DESKTOP\DGCLIPS Studio.lnk"
  Delete "$SMPROGRAMS\DGCLIPS Studio.lnk"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DGCLIPS-Desktop"
  Delete "$INSTDIR\DGCLIPS.exe"
  RMDir /r "$INSTDIR\_internal"
  Delete "$INSTDIR\Desinstalar DGCLIPS.exe"
  ; Never recursively remove the install directory: it contains the user's media.
  RMDir "$INSTDIR"
SectionEnd
