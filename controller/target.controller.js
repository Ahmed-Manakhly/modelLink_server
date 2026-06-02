const asyncErrorCatching = require("../utils/asyncErrorCatching");
const prisma = require("../prisma/prisma");

exports.createTarget = asyncErrorCatching(async (req,res)=>{

    const newTarget = await prisma.DicomTarget.create({
        data: req.body,
    });

    if(newTarget){
        res.status(201).json({
            status: "success",
            data: {
                newTarget
            }
        });
    }else{
        res.status(424).json({
            status: "failed",
            data: {
                "message":"can't create Target"
            }
        });
    }

});

exports.getAllTargets = asyncErrorCatching(async(req,res)=>{
    const Targets = await prisma.DicomTarget.findMany();
    res.status(200)
        .json({
            status: "success",
            message: "Targets retrieved!",
            data: Targets
        });
});


exports.deleteTarget = asyncErrorCatching(async (req,res)=>{

    const existingTarget = await prisma.DicomTarget.findUnique({
        where: {
            target_id: parseInt(req.params.id, 10)
        },
    });

    if (!existingTarget) {
        throw new Error('Target not found');
    }
    const deletedTarget = await prisma.DicomTarget.delete({
        where: {
            target_id: parseInt(req.params.id, 10)
        },
    });

    res.status(204).json({
        status: "success",
        data: null
    });
});

exports.getTarget = asyncErrorCatching(async(req,res)=>{
    const existingTarget = await prisma.DicomTarget.findUnique({
        where: {
            target_id: parseInt(req.params.id, 10)
        },
    });

    if (!existingTarget) {
        throw new Error(' Target not found');
    }
    res.status(200)
        .json({
            status: "success",
            message: "Target retrieved successfully!",
            data:existingTarget
        });
});


exports.updateTarget = asyncErrorCatching(async(req,res)=>{
    const TargetId = parseInt(req.params.id, 10);

    const existingTarget = await prisma.DicomTarget.findUnique({
        where: {
            target_id: TargetId,
        },
    });

    if (!existingTarget) {
        throw new Error('Target not found!');
    }

    const updatedTarget = await prisma.DicomTarget.update({
        where: {
            target_id: TargetId,
        },
        data: {
            ...req.body,
        },
    });
    res.status(200).json({
        status: 'success',
        message: 'Target updated successfully!',
        data: updatedTarget,
    });
});