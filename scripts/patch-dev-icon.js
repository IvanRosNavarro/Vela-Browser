#!/usr/bin/env node
// Parchea el icono del ejecutable local de Electron para que la barra de
// tareas y el jump list muestren el icono de Vela en desarrollo.
// Ejecutar con la app CERRADA: pnpm patch-dev-icon
//
// Se pierde si pnpm reinstala electron — volver a ejecutar en ese caso.

const path = require('path');
const { rcedit } = require('rcedit');

const electronExe = require('electron');
const iconPath = path.resolve(__dirname, '..', 'build', 'icon.ico');

console.log('Executable:', electronExe);
console.log('Icon:      ', iconPath);

rcedit(electronExe, { icon: iconPath })
  .then(() => console.log('✓ Icono aplicado. Reinicia la app.'))
  .catch((err) => {
    console.error('✗ Error:', err.message);
    console.error('  Asegúrate de que la app y cualquier proceso de electron.exe estén cerrados.');
    process.exit(1);
  });
