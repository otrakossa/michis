export interface XProfile {
  disponible: boolean;
  motivo?: string;
  perfil?: {
    handle: string;
    creado: string;
    seguidores: number;
    siguiendo: number;
    tweets_total: number;
    descripcion: string;
    ultimos_tweets: { texto: string; fecha: string }[];
  };
}

export interface XClient {
  getProfile(handle: string): Promise<XProfile>;
}

// Hasta tener clave de la API de X: el agente investiga en modo degradado.
export class MockXClient implements XClient {
  async getProfile(): Promise<XProfile> {
    return {
      disponible: false,
      motivo: "Sin clave de API de X configurada (modo degradado)",
    };
  }
}
