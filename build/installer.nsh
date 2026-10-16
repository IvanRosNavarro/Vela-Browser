; Registro de Vela como navegador en Windows.
; electron-builder incluye este fichero en el script NSIS generado.
; Las macros customInstall / customUnInstall son los puntos de extensión oficiales.

!macro customInstall
  ; ProgID para URLs (http / https / ftp)
  WriteRegStr HKCU "Software\Classes\VelaBrowserURL" "" "Vela Browser URL"
  WriteRegStr HKCU "Software\Classes\VelaBrowserURL" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\VelaBrowserURL\DefaultIcon" "" "$INSTDIR\Vela.exe,0"
  WriteRegStr HKCU "Software\Classes\VelaBrowserURL\shell\open\command" "" '"$INSTDIR\Vela.exe" "%1"'

  ; ProgID para archivos HTML
  WriteRegStr HKCU "Software\Classes\VelaBrowserHTML" "" "Vela HTML Document"
  WriteRegStr HKCU "Software\Classes\VelaBrowserHTML\DefaultIcon" "" "$INSTDIR\Vela.exe,0"
  WriteRegStr HKCU "Software\Classes\VelaBrowserHTML\shell\open\command" "" '"$INSTDIR\Vela.exe" "%1"'

  ; ProgID para PDF (+ entrada en "Abrir con" del explorador)
  WriteRegStr HKCU "Software\Classes\VelaBrowserPDF" "" "Documento PDF de Vela"
  WriteRegStr HKCU "Software\Classes\VelaBrowserPDF\DefaultIcon" "" "$INSTDIR\Vela.exe,0"
  WriteRegStr HKCU "Software\Classes\VelaBrowserPDF\shell\open\command" "" '"$INSTDIR\Vela.exe" "%1"'
  WriteRegStr HKCU "Software\Classes\.pdf\OpenWithProgids" "VelaBrowserPDF" ""

  ; Capabilities — Windows 11 lee este bloque para "Aplicaciones predeterminadas"
  WriteRegStr HKCU "Software\Vela\Capabilities" "ApplicationName" "Vela"
  WriteRegStr HKCU "Software\Vela\Capabilities" "ApplicationDescription" \
    "Navegador web con énfasis en privacidad y organización"
  WriteRegStr HKCU "Software\Vela\Capabilities\URLAssociations" "http"  "VelaBrowserURL"
  WriteRegStr HKCU "Software\Vela\Capabilities\URLAssociations" "https" "VelaBrowserURL"
  WriteRegStr HKCU "Software\Vela\Capabilities\URLAssociations" "ftp"   "VelaBrowserURL"
  WriteRegStr HKCU "Software\Vela\Capabilities\FileAssociations" ".htm"   "VelaBrowserHTML"
  WriteRegStr HKCU "Software\Vela\Capabilities\FileAssociations" ".html"  "VelaBrowserHTML"
  WriteRegStr HKCU "Software\Vela\Capabilities\FileAssociations" ".shtml" "VelaBrowserHTML"
  WriteRegStr HKCU "Software\Vela\Capabilities\FileAssociations" ".xhtml" "VelaBrowserHTML"
  WriteRegStr HKCU "Software\Vela\Capabilities\FileAssociations" ".svg"   "VelaBrowserHTML"
  WriteRegStr HKCU "Software\Vela\Capabilities\FileAssociations" ".webp"  "VelaBrowserHTML"
  WriteRegStr HKCU "Software\Vela\Capabilities\FileAssociations" ".pdf"   "VelaBrowserPDF"

  ; Punto de entrada — sin esto la app no aparece en "Aplicaciones predeterminadas"
  WriteRegStr HKCU "Software\RegisteredApplications" "Vela" "Software\Vela\Capabilities"
!macroend

!macro customUnInstall
  DeleteRegKey  HKCU "Software\Classes\VelaBrowserURL"
  DeleteRegKey  HKCU "Software\Classes\VelaBrowserHTML"
  DeleteRegKey  HKCU "Software\Classes\VelaBrowserPDF"
  DeleteRegValue HKCU "Software\Classes\.pdf\OpenWithProgids" "VelaBrowserPDF"
  DeleteRegKey  HKCU "Software\Vela\Capabilities"
  DeleteRegValue HKCU "Software\RegisteredApplications" "Vela"
!macroend

; ── Cerrar solo los procesos de este Vela al instalar o actualizar ──────────
; La comprobación de electron-builder (allowOnlyOneInstallerInstance.nsh) busca
; con PowerShell todo proceso cuya ruta EMPIECE por $INSTDIR. El navegador se
; instala en ...\Programs\Vela y Vela FTP en ...\Programs\Vela FTP, así que
; "...\Vela FTP\Vela FTP.exe" casaba con el prefijo y actualizar el navegador
; cerraba también Vela FTP. Esta copia compara contra "$INSTDIR\", con la
; barra final. El resto es la lógica original de electron-builder 26.9.0.
; Sin PowerShell se busca por nombre de imagen (Vela.exe), que ya no colisiona.
; Al subir electron-builder, revisar si la plantilla ha cambiado.

!include "getProcessInfo.nsh"
Var pid

!macro VELA_FIND_PROCESS _FILE _RETURN
  ${if} $IsPowerShellAvailable == 0
    nsExec::Exec `"$PowerShellPath" -C "if ((Get-CimInstance -ClassName Win32_Process | ? {$$_.Path -and $$_.Path.StartsWith('$INSTDIR\', 'CurrentCultureIgnoreCase')}).Count -gt 0) { exit 0 } else { exit 1 }"`
    Pop ${_RETURN}
  ${else}
    nsExec::Exec `"$CmdPath" /C tasklist /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq ${_FILE}" /FO CSV | "$FindPath" "${_FILE}"`
    Pop ${_RETURN}
  ${endIf}
!macroend

!macro VELA_KILL_PROCESS _FILE _FORCE
  Push $0
  ${if} ${_FORCE} == 1
    ${if} $IsPowerShellAvailable == 0
      StrCpy $0 "-Force"
    ${else}
      StrCpy $0 "/F"
    ${endIf}
  ${else}
    StrCpy $0 ""
  ${endIf}

  ${if} $IsPowerShellAvailable == 0
    nsExec::Exec `"$PowerShellPath" -C "Get-CimInstance -ClassName Win32_Process | ? {$$_.Path -and $$_.Path.StartsWith('$INSTDIR\', 'CurrentCultureIgnoreCase')} | % { Stop-Process -Id $$_.ProcessId $0 }"`
  ${else}
    nsExec::Exec `"$CmdPath" /C taskkill $0 /IM "${_FILE}" /FI "PID ne $pid" /FI "USERNAME eq %USERNAME%"`
  ${endIf}
  Pop $0
!macroend

!macro customCheckAppRunning
  !insertmacro IS_POWERSHELL_AVAILABLE

  ${GetProcessInfo} 0 $pid $1 $2 $3 $4
  ${if} $3 != "${APP_EXECUTABLE_FILENAME}"
    ${if} ${isUpdated}
      ; la app puede salir sola sin que haya que cerrarla
      Sleep 300
    ${endIf}

    !insertmacro VELA_FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
    ${if} $R0 == 0
      ${if} ${isUpdated}
        Sleep 1000
        Goto vela_doStopProcess
      ${endIf}
      MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK vela_doStopProcess
      Quit

      vela_doStopProcess:

      DetailPrint "$(appClosing)"

      !insertmacro VELA_KILL_PROCESS "${APP_EXECUTABLE_FILENAME}" 0
      ; para que los ficheros no sigan en uso
      Sleep 300

      StrCpy $R1 0

      vela_loop:
        IntOp $R1 $R1 + 1

        !insertmacro VELA_FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
        ${if} $R0 == 0
          Sleep 1000
          !insertmacro VELA_KILL_PROCESS "${APP_EXECUTABLE_FILENAME}" 1
          !insertmacro VELA_FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
          ${if} $R0 == 0
            DetailPrint `Waiting for "${PRODUCT_NAME}" to close.`
            Sleep 2000
          ${else}
            Goto vela_not_running
          ${endIf}
        ${else}
          Goto vela_not_running
        ${endIf}

        ; probablemente corre con permisos elevados: pedir al usuario que la cierre
        ${if} $R1 > 1
          MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY vela_loop
          Quit
        ${else}
          Goto vela_loop
        ${endIf}
      vela_not_running:
    ${endIf}
  ${endIf}
!macroend
