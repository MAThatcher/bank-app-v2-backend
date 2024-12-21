drop table if exists user_details;
drop table if exists account_users;
drop table if exists transactions;
drop table if exists accounts;
drop table if exists users;

create table if not exists users (
	id serial primary key,
	email varchar(255) unique null,
	password varchar(255) not null,
	archive boolean default false,
	create_date timestamp default current_timestamp,
	update_date timestamp default current_timestamp,
	super_user boolean default false
);
create table if not exists user_details (
	id serial primary key,
	fname varchar(255) null default 'John',
	mname varchar(255) null,
	lname varchar(255) null default 'Doe',
	address_street varchar(255) null,
	address_city varchar(255) null,
	address_state CHAR(2) null,
	address_zip numeric(5,0) null,
	create_date timestamp default current_timestamp,
	update_date timestamp default current_timestamp,
	user_id int,
	CONSTRAINT fk_users FOREIGN KEY (user_id)
	REFERENCES users(id)

);
create table if not exists accounts(
	id serial primary key,
	create_date timestamp default current_timestamp,
	update_date timestamp default current_timestamp,
	owner int,
	balance numeric(13,2) default 0,
	constraint fk_users foreign key (owner)
	references users(id)
);
create table if not exists transactions(
	id serial primary key,
	create_date timestamp default current_timestamp,
	update_date timestamp default current_timestamp,
	account_id int,
	amount numeric(13,2) not null,
	constraint fk_accounts foreign key (account_id)
	references accounts(id)
);
create table if not exists account_users(
	id serial primary key,
	create_date timestamp default current_timestamp,
	update_date timestamp default current_timestamp,
	user_id int,
	account_id int,
	constraint fk_accounts foreign key (account_id)
	references accounts(id),
	constraint fk_users foreign key (user_id)
	references users(id)
);