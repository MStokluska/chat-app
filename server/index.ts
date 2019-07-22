import { ApolloServer, PubSub } from "apollo-server-express";
import schema from "./schema";
import { app } from "./app";
import jwt from "jsonwebtoken";

// defines parsed cookie on req.cookie from cookie parser
import cookie from "cookie";
import { origin, port, secret } from "./env";

// importing http protocol that will be used in order to install subscription handlers
import http from "http";

// setting up pooling
import { pool } from "./db";
import { MyContext } from "./context";
import sql from "sql-template-strings";

// creating pubsub event listener
const pubsub = new PubSub();

const server = new ApolloServer({
  schema,
  context: async (session: any) => {
    // Access the request object
    let req = session.connection
      ? session.connection.context.request
      : session.req;

    // It's subscription
    if (session.connection) {
      // returns headers string from cookies or an empty string
      req.cookies = cookie.parse(req.headers.cookie || "");
    }

    // decoding received cookie with JWT using same secret it was encoded with to get a user from db using username on users array.
    let currentUser;
    if (req.cookies.authToken) {
      const username = jwt.verify(req.cookies.authToken, secret) as string;
      // if user name is found create array rows and run sql statement to find a user with username provided
      if (username) {
        const { rows } = await pool.query(
          sql`SELECT * FROM users WHERE username = ${username}`
        );
        currentUser = rows[0];
      }
    }

    let db;

    if (!session.connection) {
      db = await pool.connect();
    }

    return {
      currentUser,
      pubsub,
      db,
      res: session.res
    };
  },
  subscriptions: {
    onConnect(params, ws, ctx) {
      // pass the request object to context
      return {
        request: ctx.request
      };
    }
  },
  // terminating db connection
  formatResponse: (res: any, { context }: { context: MyContext }) => {
    context.db.release();
    return res;
  }
});
// enabling server to receive and set cookies and use of credentials sent in http get header
server.applyMiddleware({
  app,
  path: "/graphql",
  cors: { credentials: true, origin }
});

// once middleware was applied to the apollo server ( app and graphql ) applying http server for express app
const httpServer = http.createServer(app);

// installing subscription handlers on httpServer
server.installSubscriptionHandlers(httpServer);

httpServer.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
