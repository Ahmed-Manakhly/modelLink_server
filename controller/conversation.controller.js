const prisma = require("../prisma/prisma"); // by manakhly

const createConversation = async (req, res, next) => { // by manakhly
  const { developerId , clientId } = req.body;
  //===============================================
  const devCopyFind = await prisma.Conversation.findFirst({
    where: {
      clientId: +clientId,
      developerId : +developerId,
      copyFor : +developerId
    }
  });
  if(!devCopyFind){
    await prisma.Conversation.create({
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
  //==========================================
    const clientCopy = await prisma.Conversation.create({
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
  res.status(201).json({
    status: "success",
    data: {
      clientCopy
    },
});
};

const getConversations = async (req, res, next) => { //by manakhly
  const {id} = req.params;
  const chats = await prisma.Conversation.findMany({
    orderBy: {
      updatedAt : 'desc'
    },
    where: {
      copyFor: parseInt(id)
    }
  });
  res.status(200).json({
      status: "success",
      data: {
        chats
      },
  });
};


//======================================================================== by manakhly
const deleteConversation  = async (req, res, next) => {
  const convoId = +req?.params?.id;
  if(!convoId){
    res.status(404).json({
      status: "failed",
      data: {
        message : 'no id found'
      },
  });
  }else{
    const exChat = await prisma.Conversation.findMany({
      where: {
        id: convoId,
    },
    });
    if(exChat.length === 0){
      return     res.status(404).json({
        status: "failed",
        data: {
          message : 'Conversation Not found'
        },
    });
    }else{
      await prisma.Conversation.deleteMany({
        where: {
            id: convoId,
        },
      });
    
      await prisma.Message.deleteMany({
    
        where: {
          conversationId: parseInt(convoId)
        }
      });
      res.status(200).json({
        status: "success",
        data: {
          message : 'conversation has been deleted'
        },
    });
    }
  }
}



module.exports = {
  createConversation,
  deleteConversation,
  getConversations,
};
