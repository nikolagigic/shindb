import Server from "./controllers/server.ts";
import DatabaseManager from "./services/database-manager.ts";

if (import.meta.main) {
  const databaseManager = DatabaseManager.getInstance();
  const server = Server.start(databaseManager);
}
