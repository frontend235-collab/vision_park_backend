const express = require("express");
const dontenv = require("dotenv");
const cors = require("cors");
const nodemailer = require('nodemailer')
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");
dontenv.config();

const uri = process.env.MONGODB_URI;

const app = express();
const PORT = process.env.PORT;

app.use(
  cors({
    credentials: true,
    origin: [process.env.CLIENT_URL],
  }),
);

app.use(express.json());

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth : {
    user:process.env.EMAIL_USER,
    pass:process.env.EMAIL_PASSWORD
  }
})


const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
);

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer")) {
    return res.status(401).json({ msg: "unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ msg: "unauthorized" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;
    next();
  } catch (error) {
    console.log(error);
    return res.status(401).json({ msg: "unauthorized" });
  }
};

const managerVerify = async (req, res, next) => {
  const user = req.user;

  if (user.role !== "manager") {
    return res.status(403).json({ msg: "forbidden" });
  }

  console.log("User from manager verify", user);
  next();
};

const adminVerify = async (req, res, next) => {
  const user = req.user;

  if (user.role !== "admin") {
    return res.status(403).json({
      msg: "forbidden",
    });
  }

  console.log("User from admin verify", user);

  next();
};

async function run() {
  try {
    await client.connect();
    // Send a ping to confirm a successful connection
    const db = client.db(process.env.DB_NAME);

    // database collection name

    const usersCollection = db.collection("user");
    const projectCollection = db.collection("projects");
const contactCollection = db.collection("contacts");
    // All Route

    // POST ROUTE

    app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    // Required field check
    if (!name || !email || !message) {
      return res.status(400).json({
        message: "Name, email and message are required",
      });
    }

    const contactData = {
      name,
      email,
      phone: phone || "",
      subject: subject || "",
      message,
      status: "unread",
      createdAt: new Date(),
    };

    const result = await contactCollection.insertOne(contactData);

    res.status(201).json({
      message: "Message sent successfully",
      result,
    });
  } catch (error) {
    console.error("Contact post error:", error);

    res.status(500).json({
      message: "Failed to send message",
    });
  }
});


app.post("/api/send-email", async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    // Required fields
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        message: "Name, email and message are required",
      });
    }

    const mailOption = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_USER,
      replyTo: email,
      subject: `New Contact: ${subject || "No Subject"}`,
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2>New Contact Message</h2>

          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone || "Not provided"}</p>
          <p><strong>Subject:</strong> ${subject || "No Subject"}</p>

          <hr />

          <h3>Message:</h3>
          <p>${message}</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOption);

    res.status(200).json({
      success: true,
      message: "Contact email sent successfully",
    });

  } catch (error) {
    console.error("Contact email error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to send contact email",
    });
  }
});



app.post("/api/signup-email", async (req, res) => {
  try {
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: "Name and email are required",
      });
    }

    const mailOption = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Welcome!",
      html: `
        <h2>Welcome ${name}!</h2>
        <p>Welcome to Our Service.</p>
        <p>Your account has been created successfully.</p>
      `,
    };

    await transporter.sendMail(mailOption);

    res.status(200).json({
      success: true,
      message: "Welcome email sent successfully",
    });

  } catch (error) {
    console.error("Signup email error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to send welcome email",
    });
  }
});

app.get(
  "/api/admin/contacts",
  verifyToken,
  adminVerify,
  async (req, res) => {
    try {
      const contacts = await contactCollection
        .find({})
        .sort({ createdAt: -1 })
        .toArray();

      res.status(200).json({
        data: contacts,
        totalData: contacts.length,
      });
    } catch (error) {
      console.error("Get contacts error:", error);

      res.status(500).json({
        message: "Failed to fetch contacts",
      });
    }
  }
);


    app.post(
      "/manager/projects",
      verifyToken,
      managerVerify,
      async (req, res) => {
        const data = req.body;
          console.log("Data received in Server Action:", data);
        const result = await projectCollection.insertOne({
          ...data,
          userId: req.user.id,
        });

        res.send(result);
      },
    );

    // GET ROUTE

    app.get(
      "/manager/projects",
      verifyToken,
      managerVerify,
      async (req, res) => {
        const { page = 1, limit = 8 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);

        const result = await projectCollection.find({ userId: req.user.id })
        .skip(skip)
        .limit(Number(limit))
        .toArray();

        const totalData = await projectCollection.countDocuments({
        userId: req.user.id,
        });

        const totalPage = Math.ceil(totalData / Number(limit));

        res.send({ data: result, page: Number(page), totalPage });

      },
    );

    

    // GET ALL PROJECTS - PUBLIC ROUTE
app.get("/projects", async (req, res) => {
  try {
    const { page = 1, limit = 8 } = req.query;

    const skip = (Number(page) - 1) * Number(limit);

    const result = await projectCollection
      .find({})
      .skip(skip)
      .limit(Number(limit))
      .toArray();

    const totalData = await projectCollection.countDocuments();

    const totalPage = Math.ceil(totalData / Number(limit));

    res.status(200).json({
      data: result,
      page: Number(page),
      totalPage,
      totalData,
    });
  } catch (error) {
    console.error("Get all projects error:", error);

    res.status(500).json({
      message: "Failed to fetch projects",
    });
  }
});

app.get("/api/projects", async (req, res) => {
  try {
    const { limit = 2 } = req.query;

    const result = await projectCollection
      .find({})
      .limit(Number(limit))
      .toArray();

    res.status(200).json({
      data: result,
      totalData: result.length,
    });
  } catch (error) {
    console.error("Get projects error:", error);

    res.status(500).json({
      message: "Failed to fetch projects",
    });
  }
});

  app.get("/projects/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        message: "Invalid project ID",
      });
    }

    const project = await projectCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!project) {
      return res.status(404).json({
        message: "Project not found",
      });
    }

    res.status(200).json(project);
  } catch (error) {
    console.error("Get single project error:", error);

    res.status(500).json({
      message: "Failed to fetch project",
    });
  }
});





    // delete route 

    // DELETE PROJECT

app.delete(
  "/manager/projects/:id",
  verifyToken,
  managerVerify,
  async (req, res) => {
    try {
      const { id } = req.params;

      // Invalid MongoDB ID check
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          message: "Invalid project ID",
        });
      }

      const result = await projectCollection.deleteOne({
        _id: new ObjectId(id),
        userId: req.user.id,
      });

      if (result.deletedCount === 0) {
        return res.status(404).json({
          message: "Project not found or you are not authorized",
        });
      }

      res.status(200).json({
        message: "Project deleted successfully",
        result,
      });
    } catch (error) {
      console.error("Delete project error:", error);

      res.status(500).json({
        message: "Failed to delete project",
      });
    }
  },
);

      // patch 

      // UPDATE PROJECT

app.patch(
  "/manager/projects/:id",
  verifyToken,
  managerVerify,
  async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Invalid ID check
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({
          message: "Invalid project ID",
        });
      }

      // শুধু নিজের project update করতে পারবে
      const result = await projectCollection.updateOne(
        {
          _id: new ObjectId(id),
          userId: req.user.id,
        },
        {
          $set: updateData,
        },
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({
          message: "Project not found or unauthorized",
        });
      }

      res.status(200).json({
        message: "Project updated successfully",
        result,
      });
    } catch (error) {
      console.error("Update project error:", error);

      res.status(500).json({
        message: "Failed to update project",
      });
    }
  },
);


    console.log("MongoDB Connected");
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
