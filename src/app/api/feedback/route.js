// src/app/api/feedback/route.js

import { NextResponse } from 'next/server';
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE || 'Chatlogs';
const AWS_REGION = process.env.AWS_REGION || 'ap-south-1';
const ddbClient = new DynamoDBClient({ region: AWS_REGION });

export async function PUT(request) {
  try {
    const { messageId, action, reportMessage } = await request.json();

    // Validate the action – it must be 'like', 'dislike', or 'report'
    if (!['like', 'dislike', 'report'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    // Build update expression:
    // For "like" and "dislike", set the chosen action to true and ensure the opposite is false.
    // For "report", set report to true and update the reportMessage.
    let updateExpression = 'SET actions.#action = :true';
    const expressionAttributeNames = { '#action': action };
    const expressionAttributeValues = { ':true': { BOOL: true } };

    if (action === 'like') {
      updateExpression += ', actions.#dislike = :false';
      expressionAttributeNames['#dislike'] = 'dislike';
      expressionAttributeValues[':false'] = { BOOL: false };
    } else if (action === 'dislike') {
      updateExpression += ', actions.#like = :false';
      expressionAttributeNames['#like'] = 'like';
      expressionAttributeValues[':false'] = { BOOL: false };
    } else if (action === 'report') {
      updateExpression += ', actions.reportMessage = :reportMsg';
      expressionAttributeValues[':reportMsg'] = { S: reportMessage || '' };
    }

    const updateCommand = new UpdateItemCommand({
      TableName: DYNAMODB_TABLE,
      Key: { messageId: { S: messageId } },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    });

    await ddbClient.send(updateCommand);

    return NextResponse.json({ message: 'Feedback updated successfully', messageId });
  } catch (error) {
    console.error('Feedback API error:', error);
    return NextResponse.json(
      { error: 'Failed to update feedback', details: error.message },
      { status: 500 }
    );
  }
}
