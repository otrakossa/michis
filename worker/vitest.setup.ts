import { config } from "dotenv";
// El .env vive en la raíz del repo (un nivel arriba de worker/)
config({ path: new URL("../.env", import.meta.url).pathname });
