// const Message = require("../models/message.model");
// const Conversation = require("../models/conversation.model");
// const createError = require("../utils/createError");
const prisma = require("../prisma/prisma"); // by manakhly

const path = require('path')
const multer  = require('multer')

const storage = multer.diskStorage({
    destination : (req,file,cb)=>{
        cb(null,'public')
    },
    filename :  (req,file,cb)=>{
        cb(null,file.fieldname+"_"+"IMG"+"_"+Date.now()+path.extname(file.originalname))
    },
})

// const upload = multer({ dest: 'uploads/' })
const upload = multer({ storage: storage })

const createMessage = async (req, res, next) => { // by manakhly
  return upload.single('attachment')(req,res , async()=>{
    let desc , userId , conversationId
    // let attachment = req?.file?.filename?req.file.filename:null
    if (req?.file?.filename){
      desc = req?.file?.filename
      userId = +req.query.userId
      conversationId = +req.query.conversationId
    }else {
      desc = req.body.desc
      userId = +req.body.userId
      conversationId = +req.body.conversationId
    }
    //===========================================================
    // const { desc , userId , conversationId} = req.body;
    const conversationFind = await prisma.Conversation.findFirst({
      where: {
        id : +conversationId
      }
    });
    if(conversationFind){  
      const {developerId , clientId} = conversationFind
      let clientCopy , devCopy
      //=========================================
      clientCopy = await prisma.Conversation.findFirst({
        where: {
          clientId,
          developerId,
          copyFor : clientId
        }
      });
      if(!clientCopy){
        clientCopy = await prisma.Conversation.create({
          data : {
            lastMessage : '',
            developerId : +developerId,
            clientId : +clientId,
            readByDeveloper: false,
            readByClient: false,
            updatedAt : new Date() ,
            unReadMsg : 0,
            copyFor : +clientId
          }
        })
      }
      //=====================================
      devCopy = await prisma.Conversation.findFirst({
        where: {
          clientId,
          developerId,
          copyFor : developerId
        }
      });
      if(!devCopy){
        devCopy = await prisma.Conversation.create({
          data : {
            lastMessage : '',
            developerId : +developerId,
            clientId : +clientId,
            readByDeveloper: false,
            readByClient: false,
            updatedAt : new Date() ,
            unReadMsg : 0,
            copyFor : +developerId
          }
        })
      }
      //=====================================
      const clientCopyId = clientCopy.id
      const devCopyId = devCopy.id
      //====================================================
      const newMsg = await prisma.Message.create({
        data : {
          desc,
          userId,
          conversationId : clientCopyId,
          updatedAt : new Date()
        }
      })
      await prisma.Message.create({
        data : {
          desc,
          userId,
          conversationId : devCopyId,
          updatedAt : new Date()
        }
      })
        await prisma.Conversation.update({
        where: {
            id: parseInt(devCopyId)
        },
        data: {
          lastMessage : desc,
          updatedAt : new Date() ,
          unReadMsg : devCopy.unReadMsg + 1,
        }
      });
        await prisma.Conversation.update({
        where: {
            id: parseInt(clientCopyId)
        },
        data: {
          lastMessage : desc,
          updatedAt : new Date() ,
          unReadMsg : clientCopy.unReadMsg + 1,
        }
      });
      res.status(201).json({
        status: "success",
        data: {
          newMsg
        },
      });
    }else{
      res.status(404).json({
        status: "failed",
        data: {
          message : 'not found!'
        },
      });
    }
    }
  )
};
//=====================================================================================================================
const getMessages = async (req, res, next) => {// by manakhly
  const {id} = req?.params;
  if(!id){
    console.log('not found')
    return
  }else{
    const messages = await prisma.Message.findMany({
      orderBy: {
        updatedAt : 'asc'
      },
      where: {
        conversationId: +id
      }
    });
    if(id){
      await prisma.Conversation.updateMany({
        where: {
            id: parseInt(id)
        },
        data: {
          unReadMsg : 0,
        }
      });
    }
    res.status(200).json({
      status: "success",
      data: {
        messages
      },
    });
  };
}
module.exports = { getMessages , createMessage }