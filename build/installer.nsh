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
