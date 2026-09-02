CREATE TABLE "cities" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	CONSTRAINT "cities_code_unique" UNIQUE("code")
);
