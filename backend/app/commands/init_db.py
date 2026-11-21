from app.infrastructure.database import Base, engine
from app import models

def main():
    print("Creating all tables...")
    # Use SQLAlchemy's metadata to create all tables defined in the ORM models.
    Base.metadata.create_all(bind=engine)
    print("Database tables created.")


if __name__ == "__main__":
    main()
