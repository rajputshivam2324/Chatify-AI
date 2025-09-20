import express from "express";
import cors from "cors";
import llmRoutes from "./routes/llmRoutes.js";

const app = express();
const port = 4001;

// Add CORS middleware
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

// Increase payload limits for image uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use('/model', llmRoutes);

app.listen(port, () => {
  console.log(`Server running successfully on port ${port}`);
});