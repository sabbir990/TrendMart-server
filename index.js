const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken')
const port = process.env.PORT || 8000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)

app.use(express.json());
app.use(cors({
  origin : [
    'https://trendmart-2a783.web.app',
    'http://localhost:5173/'
  ]
}));

const verifyToken = (req, res, next) => {
  if (!req?.headers?.authorization) {
    return res.status(401).send({ message: 'Forbidden Access' })
  }
  const token = req?.headers?.authorization.split(' ');

  if (!token[1]) {
    return res.send(401).send({ message: "Forbidden Access" });
  }

  // console.log(token[1])

  jwt.verify(token[1], process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
    if (err) {
      // console.log(token[1])
      return res.status(403).send({ message: 'Unauthorized Access!' })
    }

    req.user = decoded;
    next();
  })

}

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.p2btb5w.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {

    const database = client.db('TrendMart');

    const userCollection = database.collection('userCollection');
    const bannerCollection = database.collection('bannerCollection');
    const productCollection = database.collection('productCollection');
    const reviewCollection = database.collection('ReviewCollection');
    const cartCollection = database.collection('cartCollection');
    const paymentCollection = database.collection('paymentCollection');

    const verifyAdmin = async (req, res, next) => {
      const user = req?.user;
      const email = user?.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);

      if (!result || result?.role !== 'admin') {
        return res.status(403).send({ message: "Unauthorized Access" })
      } else {
        next();
      }

    }

    const verifyVendor = async (req, res, next) => {
      const user = req?.user;
      const email = user?.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);

      if (!result || result?.role !== 'vendor') {
        return res.status(403).send({ message: "Unauthorized Access" })
      } else {
        next();
      }

    }


    app.put('/save-user', async (req, res) => {
      const user = req.body;
      const filter = { email: user?.email };
      const options = { upsert: true }
      const updateDoc = {
        $set: {
          ...user
        }
      }
      const result = await userCollection.updateOne(filter, updateDoc, options);
      res.send(result);
    })

    app.post('/jwt', async (req, res) => {
      const email = req.body;

      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });

      res.send({ token })
    })

    app.get('/get-specified-user/:email', async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const result = await userCollection.findOne(filter)
      res.send(result)
    })

    app.get('/banner-items', async (req, res) => {
      const result = await bannerCollection.find().toArray();
      res.send(result);
    })

    app.get('/all-products', async (req, res) => {
      const result = await productCollection.find().toArray();
      res.send(result);
    })

    app.get('/all-reviews', async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    })

    app.get('/single-product/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productCollection.findOne(query);
      res.send(result);
    })

    app.put('/add-to-cart', async (req, res) => {
      const product = req.body;
      // console.log(product)
      const filter = { 'packageData.featured_product.name': product?.packageData?.featured_product?.name };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...product
        }
      }

      const result = await cartCollection.updateOne(filter, updateDoc, options);
      res.send(result);
    })

    app.get('/cart-items/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    })

    app.delete('/delete-cart-item/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(filter);
      res.send(result);
    })

    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const priceInNumber = parseInt(price)

      if (price === undefined) return;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: priceInNumber * 100,
        currency: 'usd',
        automatic_payment_methods: {
          enabled: true
        }
      })

      res.send({ clientSecret: paymentIntent?.client_secret })
    })

    app.post('/save-payment-info', async (req, res) => {
      const info = req.body;
      const filter = { 'packageData.featured_product.name': info?.featured_product?.name };
      const existsInCart = await cartCollection.findOne(filter);
      if (existsInCart) {
        const cartFilter = { 'packageData.featured_product.name': info?.featured_product?.name }
        await cartCollection.deleteOne(cartFilter);
      }
      const filterForProductCollection = { 'featured_product.name': info?.featured_product?.name };
      const findInProductCollection = await productCollection.findOne(filterForProductCollection);
      const productStocks = findInProductCollection?.stocks_visiblity;

      parseInt(productStocks);

      const newStock = productStocks - 1;

      const updateDoc = {
        $set: {
          stocks_visiblity : newStock
        }
      }

      await productCollection.updateOne(filterForProductCollection, updateDoc);

      const result = await paymentCollection.insertOne(info);
      res.send(result);
    })

    app.get('/get-paid-information/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await paymentCollection.findOne(filter);
      res.send(result);
    })

    app.get('/checkout-item/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await cartCollection.findOne(filter);
      res.send(result);
    })

    app.post('/post-comment', async (req, res) => {
      const comment = req.body;
      const result = await reviewCollection.insertOne(comment);
      res.send(result);
    })

    app.get('/get-comments/:item_name', async (req, res) => {
      const item_name = req.params.item_name;
      const query = { item_name: item_name };
      const result = await reviewCollection.find(query).toArray();
      res.send(result);
    })

    app.get('/get-all-users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    })

    app.get('/get-user-role/:email', verifyToken, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);
      res.send({ role: result?.role })
    })

    app.patch('/update-role/:email', verifyToken, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const role = req.body.userRole;
      const filter = { email: email };
      const updateDoc = {
        $set: {
          role: role
        }
      }

      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    })

    app.get('/get-all-products-for-admin', verifyToken, verifyAdmin, async (req, res) => {
      const result = await productCollection.find().toArray();
      res.send(result);
    })

    app.post('/add-product', verifyToken, verifyAdmin, async (req, res) => {
      const product = req.body;
      console.log(product);
      const result = await productCollection.insertOne(product);
      res.send(result);
    })

    app.delete('/delete-product/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productCollection.deleteOne(query);
      res.send(result);
    })

    app.get('/update-in-que-product/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productCollection.findOne(query);
      res.send(result);
    })

    app.patch('/update-product/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const product = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          ...product
        }
      }

      const result = await productCollection.updateOne(filter, updateDoc);
      res.send(result);
    })

    app.get('/all-orders', verifyToken, verifyAdmin, async(req, res) => {
      const result = await paymentCollection.find().toArray();
      res.send(result);
    })

    app.get('/payment-details/:id', verifyToken, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const query = {_id : new ObjectId(id)};
      const result = await paymentCollection.findOne(query);
      res.send(result);
    })

    app.get('/get-status/:id', verifyToken, verifyAdmin, async(req, res) => {
      const id = req.params.id;
      const query = {_id : new ObjectId(id)};
      const result = await paymentCollection.findOne(query);
      res.send({status : result?.status})
    })

    app.patch('/update-status/:id', async(req, res) => {
      const id = req.params.id;
      const status = req.body.newStatus;
      const filter = {_id : new ObjectId(id)};
      const updateDoc = {
        $set : {
          status: status
        }
      }

      const result = await paymentCollection.updateOne(filter, updateDoc);
      res.send(result);
    })

    app.get('/get-count-payment-status', verifyToken, verifyAdmin, async(req, res) => {
      const allPayments = await paymentCollection.find().toArray();

      const processingFilter = {status : 'processing'};
      const shippingFilter = {status : 'shipping'};
      const deliveredFilter = {status : 'delivered'};
      const processingPayments = await paymentCollection.find(processingFilter).toArray();
      const shippingPayments = await paymentCollection.find(shippingFilter).toArray();
      const deliveredPayments = await paymentCollection.find(deliveredFilter).toArray();
      
      res.send({processing : processingPayments?.length,
        shipping : shippingPayments?.length,
        delivered : deliveredPayments?.length,
        total : allPayments?.length,
        allPayments
      })
    })

    app.get('/total-count-information-for-vendor', verifyToken, verifyVendor, async(req, res) => {
      const deliveredFilter = {status : 'delivered'};
      const deliveredPayments = await paymentCollection.find(deliveredFilter).toArray();
      const totalDelivered = deliveredPayments.reduce((accumulator, currentValue) => {
        return accumulator + parseFloat(currentValue?.paid);
      }, 0)
      const totalUsers = await userCollection.find().toArray();
      const totalOrders = await paymentCollection.find().toArray();
      const totalDelivery = await paymentCollection.find(deliveredFilter).toArray();
      res.send({totalDelivered, totalUsers : totalUsers?.length, totalOrders : totalOrders?.length, totalDelivery : totalDelivery?.length})
    })

    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send("TrendMart's server is running")
})

app.listen(port, () => {
  console.log(`This server is running on port ${port}`)
})