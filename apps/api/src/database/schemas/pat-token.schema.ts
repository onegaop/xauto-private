import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type PatTokenDocument = HydratedDocument<PatToken>;

@Schema({ collection: 'pat_tokens', timestamps: true })
export class PatToken {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true, unique: true, index: true })
  tokenHash!: string;

  @Prop({ required: true })
  last4!: string;

  @Prop({ required: true, enum: ['ACTIVE', 'REVOKED'], default: 'ACTIVE' })
  status!: 'ACTIVE' | 'REVOKED';

  @Prop()
  expiresAt?: Date;

  @Prop()
  revokedAt?: Date;
}

export const PatTokenSchema = SchemaFactory.createForClass(PatToken);
