/**
 * Autorrelleno de direcciones y tarjetas. Las entradas viven cifradas en el
 * vault del perfil (una fila por entrada, todo el contenido en un único BLOB
 * cifrado) y solo se descifran con el perfil desbloqueado.
 *
 * El CVV no forma parte de ningún tipo: ni se guarda ni se captura.
 */

export type AutofillKind = 'address' | 'card';

export interface AddressData {
  /** Etiqueta opcional para distinguir entradas ("Casa", "Oficina"). */
  label: string;
  fullName: string;
  company: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  postalCode: string;
  /** Provincia, estado o región. */
  region: string;
  /** Texto libre: nombre del país o código ISO ("España", "ES", "Spain"). */
  country: string;
  phone: string;
  email: string;
}

export interface VaultAddress extends AddressData {
  id: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
}

export interface CardData {
  holderName: string;
  /** Solo dígitos. */
  number: string;
  /** 1–12, o null si no se conoce. */
  expMonth: number | null;
  /** Año con cuatro cifras, o null si no se conoce. */
  expYear: number | null;
  /** Alias opcional ("Personal", "Empresa"). */
  alias: string;
}

export interface VaultCard extends CardData {
  id: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
}

export type CardBrand =
  | 'visa'
  | 'mastercard'
  | 'amex'
  | 'discover'
  | 'diners'
  | 'jcb'
  | 'unionpay'
  | 'maestro'
  | 'unknown';

/** Tarjeta sin el número completo: lo único que ve la interfaz al listar. */
export interface VaultCardSummary {
  id: string;
  holderName: string;
  alias: string;
  brand: CardBrand;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
  createdAt: number;
  updatedAt: number;
  lastUsedAt: number | null;
}

/** Opción que muestra el popup de relleno sobre la página. */
export interface AutofillOption {
  id: string;
  title: string;
  subtitle: string;
  /** Solo en tarjetas: marca detectada, para el icono. */
  brand?: CardBrand;
}

export interface AutofillPopupOptions {
  kind: AutofillKind;
  /** Host de la página que pidió el relleno, para la cabecera. */
  host: string;
  options: AutofillOption[];
}

/** Vista previa (sin número completo) de lo que se ofrece guardar. */
export interface AutofillSaveOffer {
  kind: AutofillKind;
  host: string;
  title: string;
  subtitle: string;
  brand?: CardBrand;
  /** true si actualiza una entrada existente en vez de crear una nueva. */
  isUpdate: boolean;
}

/**
 * Datos que el main envía al frame que pidió el relleno, tras la elección del
 * usuario. El preload de la pestaña los reparte entre los campos del formulario.
 */
export type AutofillFillPayload =
  | { kind: 'address'; address: AddressData }
  | { kind: 'card'; card: Pick<CardData, 'holderName' | 'number' | 'expMonth' | 'expYear'> };
