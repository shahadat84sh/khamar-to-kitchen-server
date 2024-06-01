const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;
require('dotenv').config();

// Middleware
app.use(cors({
  origin: ['http://localhost:5173','https://khamar-server-mb0e17cvf-shahadat-hossains-projects-d6251f0a.vercel.app/'],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

const verifyToken = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'Unauthorized: Missing Authorization Header' });
  }
  const token = authorization.split(" ")[1];
  if (!token) {
    return res.status(401).send({ error: true, message: 'Unauthorized: Missing Token' });
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.error("JWT Verification Error:", err);
      return res.status(401).send({ error: true, message: "Unauthorized: Invalid Token" });
    }
    req.decoded = decoded;
    next();
  });
}



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xu7lgvl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();
    const shopCollection = client.db("k2kDB").collection('shopDB');
    const productCollection = client.db("k2kDB").collection("product");
    const cartCollection = client.db('k2kDB').collection('cartProduct');
    const orderCollection = client.db('k2kDB').collection('orderItems');
    const userCollection = client.db('k2kDB').collection('users');

    app.post('/jwt', (req, res) => {
      const user = req.body.user;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1h'
      });
      res.send(token);
    });
    // all users
    app.post('/users', async (req, res) =>{
      const user = req.body;
      const query = {email: user.email}
      const existingUser = await userCollection.findOne(query)
      console.log('existingUser', existingUser)
      if(existingUser){
        return res.send({message:'User already exist'})
      }
      const result = userCollection.insertOne(user)
      res.send(result);
    })

    app.get('/users', async(req, res) =>{
      const result = await userCollection.find().toArray()
      res.send(result);
    })
// shop related api
    app.get('/shop', async (req, res) => {
      const result = await shopCollection.find().toArray();
      res.json(result);
    });

    app.get('/products', async (req, res) => {
      const { type } = req.query;
      let query = {}
      if(type){
        query.type = type;
      }
      const result = await productCollection.find(query).toArray();
      res.send(result);
    });

    app.get('/products/:id', async (req, res) => {
      const id = req.params.id;
      const result = await productCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    app.post('/cartProducts', verifyToken, async (req, res) => {
      try {
        const { userEmail, productId, name, img, weight, price, quantity } = req.body;

        if (!userEmail || !productId || !name || !img || !weight || !price || !quantity) {
          return res.status(400).send({ error: true, message: 'Missing required fields' });
        }

        const cartItem = await cartCollection.findOne({ userEmail, productId });

        if (cartItem) {
          await cartCollection.updateOne(
            { userEmail, productId },
            { $inc: { quantity: quantity } }
          );
          res.status(200).send({ message: 'Product quantity updated in cart' });
        } else {
          await cartCollection.insertOne({
            userEmail,
            productId,
            name,
            img,
            weight,
            price,
            quantity
          });
          res.status(201).send({ message: 'Product added to cart' });
        }
      } catch (error) {
        console.error("Error inserting product into cart:", error);
        res.status(500).send({ message: "Failed to insert product into cart", error });
      }
    });


    // get products by email

    app.get('/cartProducts', verifyToken, async (req, res) => {
      const email = req.query.email;
      if (!email) {
          return res.send([]);
      }
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
          return res.status(403).send({ error: true, message: 'forbidden access' });
      }
      const query = { userEmail: email };
      try {
          const result = await cartCollection.find(query).toArray();
          res.send(result);
      } catch (error) {
          console.error('Error fetching cart products:', error);
          res.status(500).send({ error: true, message: 'Server error' });
      }
  });
  // delete cartProducts
  app.delete('/cartProducts/:id', async (req, res) => {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };
  
    try {
      const result = await cartCollection.deleteOne(query); 
      if (result.deletedCount === 1) {
        res.status(200).json({ message: 'Product deleted successfully' });
      } else {
        res.status(404).json({ message: 'Product not found' });
      }
    } catch (error) {
      console.error('Error deleting product:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });

  app.delete('/cartProducts',verifyToken,async (req, res) => {
    const userId = req.user.uid; 
    const { productIds } = req.body;
  
    try {
      const result = await cartCollection.deleteMany({ 
        userId, 
        productId: { $in: productIds } 
      });
  
      if (result.deletedCount === 0) {
        return res.status(404).json({ message: 'No products found to delete' });
      }
  
      res.json({ message: 'Products removed successfully', deletedCount: result.deletedCount });
    } catch (error) {
      console.error('Error removing products:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });
// order related api
  app.post('/orders', verifyToken, async(req, res) =>{
    const { userId, items, address, total, status } = req.body;
    if (!userId || !items || !address || !total || !status) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    const newOrder = {
      userId,
      address,
      items,
      total,
      status,
      createdAt: new Date()
    }
      const result = await orderCollection.insertOne(newOrder);
      res.send(result)
  })

  // orders for admin
  app.get('/orders', async(req,res) =>{
    try {
      const orders = await orderCollection.find().toArray();
      res.json(orders)
    } catch (error) {
      res.status(500).json({message:error.message})
    }
  })
  
  // orders for customer
  app.get('/orders/:userId', verifyToken, async (req, res) =>{
      const id = req.params.userId;
      const query = {_id: new ObjectId(id)}
      const result = await orderCollection.find(query).toArray()
      res.send(result);
  })
  

    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensure client will close when you finish/error
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send("Khamar to Kitchen Server Running");
});

app.listen(port, () => {
  console.log(`Khamar server running on port: ${port}`);
});
