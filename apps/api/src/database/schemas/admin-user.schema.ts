import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AdminUserDocument = HydratedDocument<AdminUser>;

@Schema({ collection: 'admin_users', timestamps: true })
export class AdminUser {
  @Prop({ required: true, unique: true, index: true })
  email!: string;

  @Prop({ required: true, default: 'owner' })
  role!: string;

  @Prop()
  lastLoginAt?: Date;
}

export const AdminUserSchema = SchemaFactory.createForClass(AdminUser);
