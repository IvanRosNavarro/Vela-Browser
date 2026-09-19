import { z } from 'zod';
import { isAllowedFavoriteUrl } from '../types/favorite';
import { IMPORT_BROWSER_IDS } from '../types/browserImport';

const favoriteId = z.string().min(1).max(128);
const favoriteTitle = z.string().max(512);
const favoriteUrl = z
  .string()
  .max(8192)
  .refine(isAllowedFavoriteUrl, { message: 'URL no admitida' });

export const favoritesAddInputSchema = z.object({
  url: favoriteUrl,
  title: favoriteTitle,
  favicon: z.string().nullable().optional(),
  parentId: favoriteId.nullable().optional(),
  windowId: z.number().optional(),
});

export const favoritesRemoveInputSchema = z.object({
  id: favoriteId,
  /**
   * Solo para carpetas. `true` borra también todo lo que contiene; `false`
   * (por defecto) sube su contenido al nivel de la carpeta.
   */
  cascade: z.boolean().optional(),
});

export const favoritesReorderInputSchema = z.object({
  id: favoriteId,
  newPosition: z.string().min(1),
});

export const favoritesCreateFolderInputSchema = z.object({
  title: favoriteTitle,
  parentId: favoriteId.nullable().optional(),
});

export const favoritesMoveInputSchema = z.object({
  id: favoriteId,
  parentId: favoriteId.nullable(),
  newPosition: z.string().min(1),
});

export const favoritesUpdateInputSchema = z.object({
  id: favoriteId,
  url: favoriteUrl.optional(),
  title: favoriteTitle.optional(),
  favicon: z.string().nullable().optional(),
});

export const favoritesExportFileInputSchema = z.object({ data: z.string() });

export const browserImportRunInputSchema = z
  .object({
    browserId: z.enum(IMPORT_BROWSER_IDS),
    profileId: z.string().min(1).max(512),
    bookmarks: z.boolean(),
    history: z.boolean(),
  })
  .refine((v) => v.bookmarks || v.history, {
    message: 'Hay que elegir al menos marcadores o historial',
  });

export type FavoritesAddInput = z.input<typeof favoritesAddInputSchema>;
export type FavoritesRemoveInput = z.input<typeof favoritesRemoveInputSchema>;
export type FavoritesReorderInput = z.input<typeof favoritesReorderInputSchema>;
export type FavoritesCreateFolderInput = z.input<typeof favoritesCreateFolderInputSchema>;
export type FavoritesMoveInput = z.input<typeof favoritesMoveInputSchema>;
export type FavoritesUpdateInput = z.input<typeof favoritesUpdateInputSchema>;
export type BrowserImportRunInput = z.input<typeof browserImportRunInputSchema>;
